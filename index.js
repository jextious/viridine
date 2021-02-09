"use strict";

const Viridine = require("./lib/viridine"),
	server = new Viridine(),
	exitHandler = signal => {
		server.gc(true);

		process.exit(1);
	};

process.on("SIGINT", () => exitHandler("SIGINT"));
process.on("SIGHUP", () => exitHandler("SIGHUP"));
process.on("SIGTERM", () => exitHandler("SIGTERM"));
process.on("SIGQUIT", () => exitHandler("SIGQUIT"));