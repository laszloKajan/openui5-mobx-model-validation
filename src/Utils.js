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

	var _fGetKeyForArguments = function() { // Well, we should use hashing really
		return JSON.stringify(arguments, function(key, value) {
			if (value instanceof RegExp) {
				return value.toString();
			} else {
				return value;
			}
		});
	};

	var oCacheForValueType = {};
	var _fGetValueTypeObject = function(value, oType, sInternalType) {
		var sKey = _fGetKeyForArguments.apply(this, arguments);
		var oValueType = oCacheForValueType[sKey];
		if (!oValueType) {
			oCacheForValueType[sKey] = oValueType = {
				value: value,
				oType: oType,
				sInternalType: sInternalType
			};
		}
		return oValueType;
	};
	var _fTransformModelPropertyToValidationByTypeMobX = __mobxUtils.createTransformer(
		function(oSource) { // {value, oType, sInternalType}
			//					Is memoization really worth it here?
			if (!oSource.oType || !oSource.sInternalType) {
				throw new Error("Invalid function call");
			}
			// console.log("_fTransformModelPropertyToValidationByTypeMobX");
			var oRet = {
				valid: true,
				valueStateText: ""
			};

			try {
				// lkajan: In order to establish validity, we need to check parsability and validity, as the latter only checks constraints (if any).
				//		Parsability is meant for /model/ (not internal/input) values here.
				var parsedValue = oSource.oType.parseValue(oSource.value, oSource.sInternalType, true);
				oSource.oType.validateValue(parsedValue, true);
			} catch (oException) {
				if (oException instanceof ParseException || oException instanceof ValidateException) {
					oRet.valid = false;
					oRet.valueStateText = oException.message;
				} else {
					throw oException;
				}
			}
			return oRet;
		},
		function(result, oSource) {
			// Cleanup
			delete oCacheForValueType[_fGetKeyForArguments(oSource.value, oSource.oType, oSource.sInternalType)];
		});
	var _fTransformModelPropertyToValidationByType = function(value, oType, sInternalType) {
		var oSource = _fGetValueTypeObject(value, oType, sInternalType);
		return _fTransformModelPropertyToValidationByTypeMobX(oSource);
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

	return {
		/**
		 * Deprecated. Use reactionByType() and reactionChanged().
		 * 
		 * Get model object property validation results by type validation. Non-changed state appears to be valid regardless of validity.
		 * Only for simple types.
		 *
		 * @param {object} oObject - 		Model object
		 * @param {string} sProperty -		Model object property name
		 * @param {object} oType -			Property type instance
		 * @param {string} sInternalType -	Type used to display and input property, c.f. model type
		 * @param {boolean} bIgnoreChanged - Ignore (non-)changed state of property when setting valueState. true: valueState is set even if value hasn't been
		 *										changed by user
		 * @return {object} 				{valid: boolean, valueState: sap.ui.core.ValueState, valueStateText: string}
		 */
		getModelPropertyValidationByType: function(oObject, sProperty, oType, sInternalType, bIgnoreChanged) {

			console.warn("Deprecated");

			var oVal = _fTransformModelPropertyToValidationByType(__mobx.get(oObject, sProperty), oType, sInternalType);
			var oRet = { // Must copy object, because oVal is memoized and we might change it below
				valid: oVal.valid,
				valueStateText: oVal.valueStateText
			};

			if (!oRet.valid) {
				var bChanged = __mobx.get(oObject, sProperty + "$Changed");
				oRet.valueState = bChanged || bIgnoreChanged ? "Error" : "None";
			} else {
				oRet.valueState = "None";
			}
			return oRet;
		},

		/**
		 * Create a model object property validation reaction by type validation. If not changed, changedValueState is "None".
		 * Only for simple types.
		 *
		 * @param {object} oObservable - 	Observable object
		 * @param {string} sProperty -		Observable property
		 * @param {object} oType -			Property type instance
		 * @param {string} sInternalType -	Type used to display and input property, c.f. model type
		 * @param {object} oObservable2 -	Observable object of bIgnoreChanged
		 * @param {string} sIgnoreChanged -	oObservable2 property that controls whether the changed status of oObservable[sProperty] is ignored
		 * @return {[function, function]} 	[disposer function 1, disposer function 2]
		 */
		reactionChangedByType: function(oObservable, sProperty, oType, sInternalType, oObservable2, sIgnoreChanged) {
			if (!oType || !sInternalType || !oObservable2 || !sIgnoreChanged) {
				throw new Error("Invalid function call");
			}
			return [__mobx.reaction(function() {
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
						var sValidation = sProperty + "$Validation";
						if (!oObservable[sValidation]) {
							__mobx.set(oObservable, sValidation, { // More properties may be added downstream
								valid: false,
								valueState: "None",
								valueStateText: ""
							});
						}
						var oValidation = oObservable[sValidation];
						oValidation.valid = bValid;
						oValidation.valueState = bValid ? "None" : "Error";
						oValidation.valueStateText = bValid ? "" : sValueStateText;
					}, true),
				this.reactionChanged(oObservable, sProperty, oObservable2, sIgnoreChanged)
			];
		},

		reactionChanged: function(oObservable, sProperty, oObservable2, sIgnoreChanged) { // state, "sReceiverCompanyCode", state, "$ignoreChanged"
			return __mobx.reaction(function() {
				var oValidation = oObservable[sProperty + "$Validation"];
				return {
					valid: __mobx.get(oValidation, "valid"),
					bChanged: __mobx.get(oObservable, sProperty + "$Changed"),
					bIgnoreChanged: __mobx.get(oObservable, sIgnoreChanged)
				};
			}, function(oData) {
				var oValidation = oObservable[sProperty + "$Validation"];
				__mobx.set(oValidation, "changedValueState", oData.bChanged || oData.bIgnoreChanged ? "Error" : "None");
			}, true);
		},

		transformModelToValidationArray: __mobxUtils.createTransformer(function(oSource) {
			return fTransformModelToValidationArray(oSource, "");
		}),

		transformValidationArrayToValidationMessages: __mobxUtils.createTransformer(function(aSource) {
			return aSource.filter(fFilterValidationToMessage).map(fTransformValidationToMessage);
		})
	};
});