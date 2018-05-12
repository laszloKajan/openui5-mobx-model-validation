sap.ui.define([
	"sap/ui/model/ParseException",
	"sap/ui/model/ValidateException"
], function(ParseException, ValidateException) {
	"use strict";

	return {
		/**
		 * Creates simple type for MobxModel validation. Only works with simple types.
		 */
		createExtendedType: function(BaseType, sNewTypeName) {
			return BaseType.extend(sNewTypeName, {
				constructor: function() {
					BaseType.prototype.constructor.apply(this, arguments);
					this.sNameSubtype = sNewTypeName; // C.f. this.sName. We need this to tell apart types after the current JSON.stringify in models.js.
				},

				formatValue: function(value, sInternalType) { // Format the given value in model representation to an output value in the given internal type
					try {
						// Show unformatted model value in case it can't be parsed back successfully to itself (otherwise it could be formatted to "")
						var formatted = BaseType.prototype.formatValue.apply(this, arguments);
						if (value !== "" && formatted === "") { // "asdfasdfa" formatted to ""
							throw new ParseException();
						}
						var parsed = this.parseValue(formatted, sInternalType, true);
						var formatted2 = BaseType.prototype.formatValue.call(this, parsed, sInternalType);
						if (formatted !== formatted2) {
							throw new ParseException();
						}
						return formatted;
					} catch (oException) {
						if (oException instanceof ParseException) {
							return value;
						} else {
							throw oException;
						}
					}
				},

				parseValue: function(value, sInternalType, bModelValidation) { // Parse a value of the given internal type to the expected value of the model type
					try {
						var retVal = value; // Do not simplify, keep it with retVal
						retVal = BaseType.prototype.parseValue.apply(this, arguments);
						return retVal;
					} catch (oException) {
						if (bModelValidation) {
							throw oException;
						} else {
							return retVal;
						}
					}
				},

				validateValue: function(value, bModelValidation) { // Validate whether a given value in model representation is valid and meets the defined constraints
					// Only perform if bModelValidation
					if (bModelValidation) {
						try {
							BaseType.prototype.validateValue.apply(this, arguments);
						} catch (oException) {
							if (!(oException instanceof ParseException) && !(oException instanceof ValidateException)) {

								var sMsg = oException.message;
								throw new ValidateException(sMsg);
							} else {
								throw oException;
							}
						}
					}
				}
			});
		}
	};
});