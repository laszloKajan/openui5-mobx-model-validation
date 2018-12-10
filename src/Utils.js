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
			var aKeys = __mobx.isObservableArray(oNode) ? Object.keys(oNode.peek()) : Object.getOwnPropertyNames(oNode); // We need get() properties too, but ...

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
					switch (typeof(oNode[sKey])) {
						case "boolean":
						case "number":
						case "string":
						case "undefined":
							break;
						default:
							if (!bIsObservableObject || Object.getOwnPropertyDescriptor(oNode, sKey).enumerable) { // Model calculated (get) properties become 'enumberable = false' while being made observable

								var sChildPath = __p.path + "/" + sKey;
								var oChildNode = oNode[sKey];
								var aChildRes = fTransformModelToValidationArray(oChildNode, sChildPath);
								Array.prototype.push.apply(poAcc, aChildRes);
							}
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

	var _reactionChanged = function(oObservable, sPropNameValidation, sPropNameChanged, oObservable2, sIgnoreChanged) {
		// state, "sReceiverCompanyCode$Validation", "sReceiverCompanyCode$Change", state, "$ignoreChanged"
		return __mobx.reaction(function() {
			var oValidation = oObservable[sPropNameValidation];
			return JSON.stringify({
				valueState: __mobx.get(oValidation, "valueState"),
				bChanged: __mobx.get(oObservable, sPropNameChanged),
				bIgnoreChanged: __mobx.get(oObservable2, sIgnoreChanged)
			});
		}, function(sData) {
			var oData = JSON.parse(sData);
			var oValidation = oObservable[sPropNameValidation];
			__mobx.set(oValidation, "changedValueState", oData.bChanged || oData.bIgnoreChanged ? oData.valueState : "None");
		}, true);
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

	return {
		/**
		 * Namespace for functions related to sap.ui.core.message.MessageManager
		 */
		messageManager: {
			/**
			 * Creates a reaction that observes oModel.getProperty(sPropertyPath + "$Validation")'s properties
			 *	'valid', 'changedValueState' and 'valueStateText'.
			 * The reaction clears, or sets the appropriate message in sap.ui.getCore().getMessageManager().
			 * The message target is obtained as oController.getView().byId(sControlId).getId() + "/" + sControlProperty.
			 * Returns the disposer.
			 *
			 * @param {object} oController - 	Controller
			 * @param {object} oModel -			Observable data model
			 * @param {string} sPropertyPath -	Model property path to observe for validation results, e.g. '/nAmount'.
			 *									The property observed is sPropertyPath + "$Validation".
			 * @param {string} sControlId -		View 'id' of control that is the 'target' of the message
			 * @param {string} sControlProperty -
			 *									Bound property of message target control, default: 'value'.
			 * @return {function} 				Disposer function
			 */
			reactionValidationMsg: function(oController, oModel, sPropertyPath, sControlId, sControlProperty) { // , "/nAmount", "inputAmount", "value");

				var oMessageProcessor = new sap.ui.core.message.ControlMessageProcessor();
				var oMessageManager = sap.ui.getCore().getMessageManager();
				var sPathValidationMsg = sPropertyPath + "$ValidationMsg";
				var sControlProp = sControlProperty || "value";

				return __mobx.reaction(function() {
					var vValue = oModel.getProperty(sPropertyPath),
						oValidation = oModel.getProperty(sPropertyPath + "$Validation");
					// Pass data as string, so that automatic MobX change detection works
					return JSON.stringify({
						value: vValue, // Value must be accessed and sent to the reaction, in order to have the reaction set the validation message after
						//					every value change, even if the validation result remains the same: ManagedObject:2701:fModelChangeHandler().
						//					This is because the control validation message is removed by the framework after every value change.
						valid: oValidation.valid,
						valueState: oValidation.changedValueState,
						valueStateText: oValidation.valueStateText
					});
				}, function(sValidation) {
					var oValidation = JSON.parse(sValidation);
					if (oValidation.valid || oValidation.valueState === "None") { // Could be invalid, but no change yet
						_removeValidationMsg(oModel, sPropertyPath);
					} else {
						_removeValidationMsg(oModel, sPropertyPath);
						//
						var oMessage;
						oModel.setProperty(sPathValidationMsg, oMessage = new Message({
							message: oValidation.valueStateText.replace(/([{}])/g, "\\$1"),
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
					fireImmediately: true,
					delay: 5 // Delay is required to allow the message to be set /after/ the framwork removes all control messages upon value change.
						//		The removal takes place in the flow of the change handler event loop. Delay the reaction to the next event loop.
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
		 * Returns the reaction disposer.
		 *
		 * @param {object} oObservable - 	Observable object
		 * @param {string} sProperty -		Observable property
		 * @param {object} oType -			Property type instance
		 * @param {string} sInternalType -	Type used to display and input property, c.f. model type
		 * @param {object} oObservable2 -	Observable object for bIgnoreChanged property
		 * @param {string} sIgnoreChanged -	oObservable2 property that controls whether the changed status of oObservable[sProperty] is ignored
		 * @param {string} sPropNameValidation? -
		 *									Name of validation property of oObservable, default: sProperty + "$Validation"
		 * @param {string} sPropNameChanged? -
		 *									Name of changed flag property of oObservable, default: sProperty + "$Changed"
		 * @return {[function, function]} 	[disposer function 1]
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
						var bValid, sValueStateText;
						try {
							// lkajan: In order to establish validity, we need to check parsability and validity, as the latter only checks constraints (if any).
							//		Parsability is meant for /model/ (not internal/input) values here.
							var parsedValue = oType.parseValue(value, sInternalType, true);
							oType.validateValue(parsedValue, true);
							bValid = true;
						} catch (oException) {
							if (oException instanceof ParseException || oException instanceof ValidateException) {
								bValid = false;
								sValueStateText = oException.message;
							} else {
								throw oException;
							}
						}
						//
						if (!oObservable[sPropNameValidation]) {
							__mobx.set(oObservable, sPropNameValidation, { // More properties may be added downstream
								valid: false,
								valueState: "None",
								valueStateText: "",
								get changedValueState() {
									return __mobx.get(oObservable, sPropNameChanged) || __mobx.get(oObservable2, sIgnoreChanged) ? this.valueState : "None";
								}
							});
						}
						var oValidation = oObservable[sPropNameValidation];
						oValidation.valid = bValid;
						oValidation.valueState = bValid ? "None" : "Error";
						oValidation.valueStateText = bValid ? "" : sValueStateText;
					}, true)
			];
		},

		transformModelToValidationArray: __mobxUtils.createTransformer(function(oSource) {
			return fTransformModelToValidationArray(oSource, "");
		})
	};
});