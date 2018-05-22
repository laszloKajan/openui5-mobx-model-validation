sap.ui.define([
	"sap/ui/model/ParseException",
	"sap/ui/model/ValidateException"
], function(ParseException, ValidateException) {
	"use strict";

	function _getYYYYMMDDString(dDate) {
		var mm = dDate.getMonth() + 1; // getMonth() is zero-based
		var dd = dDate.getDate();

		return [dDate.getFullYear(),
			(mm > 9 ? "" : "0") + mm,
			(dd > 9 ? "" : "0") + dd
		].join("");
	}

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
					var retVal = value; // Do not simplify, make a copy to retVal
					try {
						// lkajan: This is used to parse both user input values, and model values. Make sure it's sInternalType that's parsed.
						// Currency-dbg.js:
						var vValueInInternalType = value;
						switch (this.getPrimitiveType(sInternalType)) {
							case "string":
								if (typeof vValueInInternalType !== "string") {
									if (vValueInInternalType instanceof Date) {
										switch (this.sName) {
											case "Date":
												vValueInInternalType = _getYYYYMMDDString(vValueInInternalType);
												break;
											default:
												vValueInInternalType = vValueInInternalType.toISOString();
										}
									} else {
										vValueInInternalType = String(vValueInInternalType);
									}
								}
								break;
							case "int":
							case "float":
								if (typeof vValueInInternalType !== "number") {
									vValueInInternalType = Number(vValueInInternalType);
								}
								break;
							case "any":
							default:
								throw new ParseException("Don't know how to convert value to " + sInternalType);
						}
						// TODO: test this
						retVal = BaseType.prototype.parseValue.call(this, vValueInInternalType, sInternalType, bModelValidation);
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
							// lkajan: Note: validateValue only checks constraints (if any), not syntax. In lack of constraints, it will not throw.
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