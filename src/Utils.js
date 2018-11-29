sap.ui.define([
	"org/js/mobx/mobx.umd.min",
	"org/js/mobxUtils/mobx-utils.umd",
	"sap/ui/core/message/Message",
	"sap/ui/model/ParseException",
	"sap/ui/model/ValidateException"
], function(__mobx, __mobxUtils, Message, ParseException, ValidateException) {
	"use strict";

	// TODO: remove obsolete/unused functions

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

	var fFilterValidationToMessage = function(oValidation) {
		return oValidation.valueState !== "None";
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

	var fTransformValidationToMessage = __mobxUtils.createTransformer(function(oValidation) { // Current value, index, array
		return new Message({
			message: oValidation.valueStateText.replace(/([{}])/g, "\\$1"),
			type: oValidation.valueState,
			validation: true
		});
	});

	var _reactionChanged = function(oObservable, sPropNameValidation, sPropNameChanged, oObservable2, sIgnoreChanged) {
		// state, "sReceiverCompanyCode$Validation", "sReceiverCompanyCode$Change", state, "$ignoreChanged"
		return __mobx.reaction(function() {
			var oValidation = oObservable[sPropNameValidation];
			return {
				valueState: __mobx.get(oValidation, "valueState"),
				bChanged: __mobx.get(oObservable, sPropNameChanged),
				bIgnoreChanged: __mobx.get(oObservable2, sIgnoreChanged)
			};
		}, function(oData) {
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
			reactionValidationMsg: function(oController, oModel, sPropertyPath, sControlId, __sControlProperty) { // , "/nAmount", "inputAmount", "value");

				var oMessageProcessor = new sap.ui.core.message.ControlMessageProcessor();
				var oMessageManager = sap.ui.getCore().getMessageManager();
				var sPathValidationMsg = sPropertyPath + "$ValidationMsg";
				var sControlProperty = __sControlProperty || "value";

				return __mobx.reaction(function() {
					var value = oModel.getProperty(sPropertyPath);
					var oValidation = oModel.getProperty(sPropertyPath + "$Validation");
					// Pass data as string, so that automatic MobX change detection works
					return JSON.stringify({
						value: value, // Must pass this, because all control messages are removed upon successful type validation,
						//	and the 1st round of validation is always successful now.
						//	Passing 'value' here forces the reaction to run, and re-add the message.
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
							target: oController.getView().byId(sControlId).getId() + "/" + sControlProperty, // global control ID, no leading '/'
							// technical: true,
							// processor: oModel,
							processor: oMessageProcessor,
							persistent: true // true: the message lifecycle is controlled by the application
								// validation: false	// otherwise the message is immediately removed, because of validation success
						}));
						oMessage.targetControllerId = oController.getView().getId(); // can be used to identify messages to remove when the view is destroyed,
						//																 as these messages are not removed automatically
						oMessageManager.addMessages(oMessage);
					}
				}, true);
			},

			removeAllMessages: function(oController) {
				var sTargetControllerId = oController.getView().getId();
				sap.ui.getCore().getMessageManager().removeMessages(sap.ui.getCore().getMessageManager().getMessageModel().getData().filter(function(
					oMessage) {
					return oMessage.targetControllerId === sTargetControllerId;
				}));
			}
		},

		/**
		 * Create two reactions:
		 *	1) a model object property validation reaction by type validation;
		 *	2) a reaction taking the changed-ness of the input control into account: unchanged inputs get "changedValueState" set to "None".
		 * Only for simple types.
		 * Returns the two corresponding disposers.
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
		 * @return {[function, function]} 	[disposer function 1, disposer function 2]
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
								valueStateText: ""
							});
						}
						var oValidation = oObservable[sPropNameValidation];
						oValidation.valid = bValid;
						oValidation.valueState = bValid ? "None" : "Error";
						oValidation.valueStateText = bValid ? "" : sValueStateText;
					}, true),
				// Changed state - 'changed' or 'ignoreChanged' - reaction
				_reactionChanged(oObservable, sPropNameValidation, sPropNameChanged, oObservable2, sIgnoreChanged)
			];
		},

		transformModelToValidationArray: __mobxUtils.createTransformer(function(oSource) {
			return fTransformModelToValidationArray(oSource, "");
		}),

		transformValidationArrayToValidationMessages: __mobxUtils.createTransformer(function(aSource) {
			return aSource.filter(fFilterValidationToMessage).map(fTransformValidationToMessage);
		})
	};
});