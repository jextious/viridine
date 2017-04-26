exports.v4 = ip => {
	let v4 = "";

	if (ip === "::1" || ip === "localhost") {
		v4 = "127.0.0.1";
	} else {
		v4 = ip.replace("::ffff:", "");
	}

	return v4;
};