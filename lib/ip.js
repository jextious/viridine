"use strict";

exports.v4 = ip => {
	if (ip === "::1" || ip === "localhost") {
		return "127.0.0.1";
	} else {
		return ip.replace("::ffff:", "");
	}
};