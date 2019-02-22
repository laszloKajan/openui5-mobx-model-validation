sap.ui.define([
	"org/js/mobx/mobx.umd.min",
	"org/js/mobxUtils/mobx-utils.umd",
	"sap/ui/core/message/Message",
	"sap/ui/model/ParseException",
	"sap/ui/model/ValidateException"
], function(__mobx, __mobxUtils, Message, ParseException, ValidateException) {
	"use strict";

	var oCacheForNodePath = {};
	var _fGetNodePathObject = function(oNode, sPath) {
		var oNodePath = oCacheForNodePath[sPath];
		if (!oNodePath) {
			oCacheForNodePath[sPath] = oNodePath = {
				node: oNode,
				path: sPath
			};
		}
		return oNodePath;
	};

	var fTransformValidation = __mobxUtils.createTransformer(function(oValidation) {
		return {
			valid: oValidation.valid,
			valueState: oValidation.valueState,
			valueStateText: oValidation.valueStateText
				// May add path and other properties
		};
	});
	var fTransformModelToValidationArray;
	var _fTransformModelToValidationArrayMobX = __mobxUtils.createTransformer(
		function(__p) { // ({node: stateNode, path: ""})

			var oNode = __p.node;
			var bIsObservableObject = __mobx.isObservableObject(oNode);
			var aKeys = __mobx.isObservableArray(oNode) ? Object.keys(oNode.peek()) : Object.getOwnPropertyNames(oNode); // getOwnPropertyNames() gives get() properties too, with Object.getOwnPropertyDescriptor(oNode, sKey).enumerable becoming false, when the object is made observable.

			var oAcc = aKeys.filter(function(sKey) {
				return sKey.indexOf("$") === -1;
			}).reduce(function(poAcc, sKey) {

				var sValLeafKey = sKey + "$Validation";

				if (oNode.hasOwnProperty(sValLeafKey)) {

					var oValidation = oNode[sValLeafKey];

					if (!oValidation.valid) {
						var oValidationTransformed = fTransformValidation(oValidation);
						poAcc.push(oValidationTransformed);
					}
				} else {
					// Descend?
					if (typeof oNode[sKey] === "object" && oNode[sKey] !== null &&
						(!bIsObservableObject || Object.getOwnPropertyDescriptor(oNode, sKey).enumerable)) { // Model calculated (get) properties become 'enumberable = false' when the object is made observable.

						var sChildPath = __p.path + "/" + sKey;
						var oChildNode = oNode[sKey];
						var aChildRes = fTransformModelToValidationArray(oChildNode, sChildPath);
						Array.prototype.push.apply(poAcc, aChildRes);
					}
				}
				return poAcc;
			}, []);
			// console.log("fTransformModelToValidationArray" + " " + __p.path);
			return oAcc;
		},
		function(result, value) {
			// Cleanup
			delete oCacheForNodePath[value.path];
		});
	fTransformModelToValidationArray = function(oNode, sPath) {
		var oNodePath = _fGetNodePathObject(oNode, sPath);
		return _fTransformModelToValidationArrayMobX(oNodePath);
	};

	var _removeValidationMsg = function(oModel, sPath) { // oModel, "/nAmount"
		var sPathValidationMsg = sPath + "$ValidationMsg";
		var oMessage = oModel.getProperty(sPathValidationMsg);

		if (oMessage) {
			var oMessageManager = sap.ui.getCore().getMessageManager();
			oMessageManager.removeMessages(oMessage);
			oMessage.destroy();
			oModel.setProperty(sPathValidationMsg, oMessage = null);
		}
	};

	var _walk;

	var utils = {
		/**
		 * Namespace for functions related to sap.ui.core.message.MessageManager
		 */
		messageManager: {
			/**
			 * Escape curly brackets [{}] in oValidation.valueStateText with '\'. Returns the escaped valueStateText.
			 *
			 * @param {object} oValidation	 	Validation results object. See fMsgTransformer parameter of reactionValidationMsg().
			 * @returns {string} 				The escaped valueStateText
			 */
			escapeCurlies: function(oValidation) {
				return oValidation.valueStateText.replace(/([{}])/g, "\\$1");
			},

			/**
			 * Creates a reaction that observes oModel.getProperty(sPropertyPath + "$Validation")'s properties
			 *	'valid', 'changedValueState' and 'valueStateText'.
			 * The reaction clears, or sets the appropriate message in sap.ui.getCore().getMessageManager().
			 * The message target is obtained as oController.getView().byId(sControlId).getId() + "/" + sControlProperty.
			 * Returns the disposer.
			 *
			 * @param {object} oController  	Controller
			 * @param {object} oModel 			Observable data model
			 * @param {string} sPropertyPath 	Model property path to observe for validation results, e.g. '/nAmount'.
			 *									The property observed is sPropertyPath + "$Validation".
			 * @param {string} sControlId 		View 'id' of control that is the 'target' of the message
			 * @param {string} sControlProperty? 
			 *									Bound property of message target control, default: 'value'.
			 * @param {function} fMessageTransformer?: (p1: {exception: undefined | ParseException | ValidateException;
			 *										valid: boolean; value: any; valueState: "None" | "Error"; valueStateText: string}) => string
			 *									Message transformer function.
			 *									The default implementation is escapeCurlies().
			 *									Allows the customization of validation messages. Especially useful when regular expression constraints are used,
			 *									and the raw message is like 'Enter a value matching "the.regular.expression"'.
			 * @returns {function} 				Disposer function
			 */
			reactionValidationMsg: function(oController, oModel, sPropertyPath, sControlId, sControlProperty, fMessageTransformer) { // , "/nAmount", "inputAmount", "value");

				var oMessageProcessor = new sap.ui.core.message.ControlMessageProcessor();
				var oMessageManager = sap.ui.getCore().getMessageManager();
				var sPathValidationMsg = sPropertyPath + "$ValidationMsg";
				var sControlProp = sControlProperty || "value";
				var fMsgTransformer = fMessageTransformer || utils.messageManager.escapeCurlies;

				return __mobx.reaction(function() {
					// Observe validation results, not the original value itself, as that and the validation results are not updated in one action.
					var oValidation = oModel.getProperty(sPropertyPath + "$Validation");
					// oValidation may be undefined, e.g. after removing a dwarf in the tutorial
					var oData = {};
					if (oValidation) {
						oData.exception = oValidation.exception;
						oData.valid = oValidation.valid;
						// Value must be accessed and sent to the reaction, in order to have the reaction set the validation message after
						//	every value change, even if the validation /result/ remains the same: ManagedObject:2701:fModelChangeHandler().
						//	This is because the control validation message is removed by the framework after every value change.
						oData.value = oValidation.value;
						oData.valueState = oValidation.changedValueState;
						oData.valueStateText = oValidation.valueStateText;
					}
					return oData;
				}, function(oValidation) {
					// Could be invalid, but no change yet. Remove the message in case oValidation.valid is undefined.
					if (oValidation.valid || oValidation.valueState === "None" || oValidation.valid === undefined) {
						_removeValidationMsg(oModel, sPropertyPath);
					} else {
						_removeValidationMsg(oModel, sPropertyPath);
						//
						var oMessage;
						oModel.setProperty(sPathValidationMsg, oMessage = new Message({
							message: fMsgTransformer(oValidation),
							type: oValidation.valueState,
							target: oController.getView().byId(sControlId).getId() + "/" + sControlProp, // global control ID, no leading '/'
							// technical: true,
							// processor: oModel,
							processor: oMessageProcessor,
							persistent: true // true: the message lifecycle is controlled by the application
								// validation: false	// otherwise the message is immediately removed, because of validation success
						}));
						oMessage.targetControllerId = oController.getView().getId(); // Can be used to identify messages to remove when the view is destroyed,
						//																as these messages are not removed automatically.
						//																Note: the UI5 part of the validation is always successful when this library is used.
						oMessageManager.addMessages(oMessage);
					}
				}, {
					compareStructural: true,
					fireImmediately: true
						// delay: 5 // Delay is /not/ required now, as the reaction now does not depend on the value itself, but the result of the validation reaction.
						//				Otherwise the delay is required to allow the message to be set /after/ the framwork removes all control messages upon value change.
						//				Message removal takes place in the flow of the change handler event loop. Delay the reaction to the next event loop.
				});
			},

			removeAllMessages: function(oController) {
				var sTargetControllerId = oController.getView().getId(),
					oMessageManager = sap.ui.getCore().getMessageManager();
				oMessageManager.removeMessages(oMessageManager.getMessageModel().getData().filter(function(oMessage) {
					return oMessage.targetControllerId === sTargetControllerId;
				}));
			}
		},

		/**
		 * Creates a model property validation MobX reaction by type validation.
		 * Only for simple types.
		 * Validation results are stored in the sPropNameValidation property, which references an object like:
		 * {
		 *	 exception:			undefined | ParseException | ValidateException
		 *   value: 			any,						// the value that was validated
		 *   valid: 			boolean,
		 *	 valueState:		"None" | "Error",
		 *   valueStateText:	string,						// validation message, if any
		 *   changedValueState:	"None" | "Error"			// valueState, taking into account the sPropNameChanged and sIgnoreChanged properties, see below
		 * }.
		 * Returns the reaction disposer.
		 *
		 * @param {object} oObservable  	Observable object
		 * @param {string} sProperty 		Observable property
		 * @param {object} oType 			Property type instance
		 * @param {string} sInternalType 	Type used to display and input property, c.f. model type
		 * @param {object} oObservable2 	Observable object for bIgnoreChanged property
		 * @param {string} sIgnoreChanged 	oObservable2 property that controls whether the changed status of oObservable[sProperty] is ignored
		 * @param {string} sPropNameValidation?
		 *									Name of validation property of oObservable, default: sProperty + "$Validation"
		 * @param {string} sPropNameChanged?
		 *									Name of changed flag property of oObservable, default: sProperty + "$Changed".
		 *									If sProperty is not yet changed and oObservable2[sIgnoreChanged] is false, changedValueState will not
		 *									indicate a validation error. This is to allow initial, not-yet-changed fields to show up with a "None" value state.
		 * @returns {[function]} 			[disposer function]
		 */
		reactionByTypeChanged: function(oObservable, sProperty, oType, sInternalType, oObservable2, sIgnoreChanged, sPropNameValidation,
			sPropNameChanged) {
			if (!oType || !sInternalType || !oObservable2 || !sIgnoreChanged) {
				throw new Error("Invalid function call");
			}
			sPropNameValidation = sPropNameValidation || sProperty + "$Validation";
			sPropNameChanged = sPropNameChanged || sProperty + "$Changed";
			return [
				// Validation reaction
				__mobx.reaction(function() {
						return __mobx.get(oObservable, sProperty);
					},
					function(value) {
						// Condition
						var bValid, oException, sValueStateText;
						try {
							// lkajan: In order to establish validity, we need to check parsability and validity, as the latter only checks constraints (if any).
							//		Parsability is meant for /model/ (not internal/input) values here.
							var parsedValue = oType.parseValue(value, sInternalType, true);
							oType.validateValue(parsedValue, true);
							bValid = true;
						} catch (oEx) {
							if (oEx instanceof ParseException || oEx instanceof ValidateException) {
								bValid = false;
								oException = oEx;
								sValueStateText = oEx.message;
							} else {
								throw oEx;
							}
						}
						//
						if (!oObservable[sPropNameValidation]) {
							__mobx.set(oObservable, sPropNameValidation, { // More properties may be added downstream
								//exception: oException
								//value: value
								valid: false,
								valueState: "None",
								valueStateText: "",
								get changedValueState() {
									return __mobx.get(oObservable, sPropNameChanged) || __mobx.get(oObservable2, sIgnoreChanged) ? this.valueState : "None";
								}
							});
						}
						var oValidation = oObservable[sPropNameValidation];
						__mobx.set(oValidation, "exception", oException);
						__mobx.set(oValidation, "value", value);
						oValidation.valid = bValid;
						oValidation.valueState = bValid ? "None" : "Error";
						oValidation.valueStateText = bValid ? "" : sValueStateText;
					}, true)
			];
		},

		/**
		 * Reset all *$Changed properties.
		 * 
		 * @param {object} oNode: any -		Observable node
		 */
		reset$Changed: function(__oNode) {
			_walk(__oNode, function(oNode, sChildKey, sNodePath) {
				console.log(sNodePath + (sNodePath.substr(-1, 1) === "/" ? "" : "/") + sChildKey);
				if (typeof oNode[sChildKey] === "boolean" && /\$Changed$/.test(sChildKey)) {
					oNode[sChildKey] = false;
				}
			});
		},

		transformModelToValidationArray: __mobxUtils.createTransformer(function(oSource) {
			return fTransformModelToValidationArray(oSource, "");
		}),

		/**
		 * Perform a depth-first walk of the tree, calling given function on every child node.
		 * Child nodes "$mobx" and "$transformId" are ignored.
		 * Will not descend into child nodes with "$" in the name.
		 * 
		 * @param {object} oNode: any 		Observable node
		 * @param {function} fFunc: (oNode: any; sChildKey: string; sNodePath: string) => void
		 *									Callback
		 * @param {string} sKey? 			Key of given node, default: ""
		 * @param {string} sPath? 			Path of given node, default: "/"
		 */
		walk: _walk = function(oNode, fFunc, sKey, sPath) {

			sKey = sKey || "";
			sPath = sPath || "/";

			if (typeof oNode === "object" && oNode !== null && sKey.indexOf("$") === -1) {
				var aKeys = __mobx.isObservableArray(oNode) ? Object.keys(oNode.peek()) : Object.getOwnPropertyNames(oNode);

				aKeys.forEach(function(sChildKey) {
					if (sChildKey !== "$mobx" && sChildKey !== "$transformId") {
						fFunc(oNode, sChildKey, sPath);
						//
						var oChildNode = oNode[sChildKey];
						if (typeof oChildNode === "object") {
							var sChildPath = sPath + (sPath.substr(-1, 1) !== "/" ? "/" : "") + sChildKey;
							_walk(oChildNode, fFunc, sChildKey, sChildPath);
						}
					}
				});
			}
		}
	};
	return utils;
});