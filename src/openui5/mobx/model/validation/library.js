sap.ui.define([
	"sap/ui/core/Core",
	// manifest.json "sap.ui5"."dependencies"."libs" dependencies (append "/library", e.g. "sap.ui.core" => "sap/ui/core/library")
	"sap/ui/core/library"
], function(Core) {
	"use strict";

	sap.ui.getCore().initLibrary({
		name: "openui5.mobx.model.validation",
		version: "1.2.1",
		noLibraryCSS: true,
		dependencies: [
			"sap.ui.core"
		],
		types: [],
		interfaces: [],
		controls: [],
		elements: [],
		extensions: []
	});

	/* eslint-disable */
	return openui5.mobx.model.validation;
	/* eslint-enable */

}, /* bExport= */ false);