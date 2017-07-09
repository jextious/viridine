exports.v4 = ip => {
	"use strict";

	if (ip === "::1" || ip === "localhost") {
		return "127.0.0.1";
	} else {
		return ip.replace("::ffff:", "");
	}
};