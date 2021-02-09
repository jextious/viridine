"use strict";

const vm = require("vm"),
	path = require("path"),
	fs = require("fs");

let mysql;

function urlEncode(str) {
	str = encodeURIComponent(str);
	str = str.replace(/\*/g, "%2a");
	str = str.replace(/'/g, "%27");
	str = str.replace(/%20/g, "+");

	return str;
}

function urlDecode(str) {
	str = str.replace(/\+/g, " ");
	str = decodeURIComponent(str);

	return str;
}

function htmlEntities(str) {
	str += "";
	str = str.replace(/&/g, "&amp;");
	str = str.replace(/</g, "&lt;");
	str = str.replace(/>/g, "&gt;");
	str = str.replace(/"/g, "&quot;");
	str = str.replace(/'/g, "&#39;");

	return str;
}

function addSlashes(str) {
	str += "";
	str = str.replace(/[\\"']/g, "\\$&");
	str = str.replace(/\u0000/g, "\\0");

	return str;
}

function ucFirst(str) {
	if (!str.length) return "";

	return str[0].toUpperCase() + str.substr(1);
}

function isSet(variable) {
	return typeof variable !== "undefined";
}

function isNumeric(value) {
	return value !== "" && !isNaN(+value);
}

function numberFormat(number, sep = ",") {
	let str = number + "",
		i = str.indexOf(".");

	if (str.length < 4) return str;

	for (i = (i > -1 ? i : str.length) - 3; i > 0; i -= 3) {
		str = str.substr(0, i) + sep + str.substr(i);
	}

	return str;
}

function escapeUnicode(str) {
    return str.replace(/[^\0-~]/g, chr => {
        return "\\u" + ("0000" + chr.charCodeAt().toString(16)).slice(-4);
    });
}

function removeDir(dir) {
	let files = fs.readdirSync(dir),
		i;

	for (i of files) {
		i = path.join(dir, i);

		if (fs.lstatSync(i).isDirectory()) {
			removeDir(i);
		} else {
			fs.unlinkSync(i);
		}
	}

	fs.rmdirSync(dir);
}

function generateError(err) {
	let start = err.stack.indexOf("%file%") + 6,
		end = err.stack.indexOf("\n", start) - start,
		msg = err.message.toString();

	err = err.stack.substr(start, end).split(":");

	return "Fatal error: " + msg + " in " + err[0] + " on line " + err[1];
}

module.exports = (root, data, headers) => {
	let output = "",
		cache = null,
		ended = false,
		dbStream,
		session = "",
		includePath = path.dirname(root.filename),
		sandbox = {
			COOKIE: {}
		},
		included = {},
		i;

	sandbox.SERVER = root.globalServer;

	sandbox.GET = root.globalGet;

	sandbox.POST = root.globalPost;

	sandbox.FILES = root.globalFiles;

	sandbox.DATA = root.globalData;

	for (i in root.globalCookies) {
		if (root.globalCookies.hasOwnProperty(i)) {
			try {
				sandbox.COOKIE[i] = decodeURIComponent(root.globalCookies[i]);
			} catch (err) {
				sandbox.COOKIE[i] = root.globalCookies[i];
			}
		}
	}

	sandbox.require = require;

	sandbox.urlEncode = urlEncode;
	sandbox.urlDecode = urlDecode;

	sandbox.htmlEntities = htmlEntities;

	sandbox.addSlashes = addSlashes;

	sandbox.ucFirst = ucFirst;

	sandbox.isSet = isSet;

	sandbox.isNumeric = isNumeric;

	sandbox.numberFormat = numberFormat;

	sandbox.escapeUnicode = escapeUnicode;

	sandbox.echo = str => {
		if (typeof str !== "string") str = JSON.stringify(str);

		output += str;
	};

	sandbox.setHeader = (name, value) => {
		headers[name] = value;

		if (name.toLowerCase() === "location" && root.status !== 201 && (root.status < 300 || root.status > 399)) {
			root.status = 302;

			output = "";
		}
	};

	sandbox.setCache = (bool, time) => {
		cache = null;

		if (bool) {
			cache = {};

			if (time !== undefined) cache.expires = time;
		}
	};

	sandbox.setCookie = (name, value, expire, path, domain, secure, http) => {
		root.setCookie(name, value, expire, path, domain, secure, http);
	};

	sandbox.setStatus = code => {
		root.status = code;
	};

	sandbox.setTimeLimit = time => {
		clearTimeout(root.timeout);

		if (time) {
			root.timeout = setTimeout(() => root.sendErrorPage(504), time);
		} else {
			root.timeout = null;
		}
	};

	sandbox.scanDir = dir => {
		if (!path.isAbsolute(dir)) dir = path.join(includePath, dir);

		if (fs.existsSync(dir)) return fs.readdirSync(dir);

		return [];
	};

	sandbox.makeDir = dir => {
		if (!path.isAbsolute(dir)) dir = path.join(includePath, dir);

		if (!fs.existsSync(dir)) fs.mkdirSync(dir);
	};

	sandbox.removeDir = dir => {
		if (!path.isAbsolute(dir)) dir = path.join(includePath, dir);

		if (fs.existsSync(dir)) removeDir(dir);
	};

	sandbox.fileRename = (oldPath, newPath) => {
		if (!path.isAbsolute(oldPath)) oldPath = path.join(includePath, oldPath);

		if (!path.isAbsolute(newPath)) newPath = path.join(includePath, newPath);

		fs.renameSync(oldPath, newPath);
	};

	sandbox.fileCopy = (src, dest) => {
		if (!path.isAbsolute(src)) src = path.join(includePath, src);

		if (!path.isAbsolute(dest)) dest = path.join(includePath, dest);

		if (fs.existsSync(src)) fs.writeFileSync(dest, fs.readFileSync(src));
	};

	sandbox.fileExists = file => {
		if (!path.isAbsolute(file)) file = path.join(includePath, file);

		return fs.existsSync(file);
	};

	sandbox.fileGetContents = file => {
		if (!path.isAbsolute(file)) file = path.join(includePath, file);

		if (fs.existsSync(file)) return fs.readFileSync(file) + "";

		return "Error: could not find file " + file;
	};

	sandbox.filePutContents = (file, str) => {
		if (!path.isAbsolute(file)) file = path.join(includePath, file);

		fs.writeFileSync(file, str);
	};

	sandbox.fileUnlink = file => {
		if (!path.isAbsolute(file)) file = path.join(includePath, file);

		if (fs.existsSync(file)) fs.unlinkSync(file);
	};

	sandbox.fileStats = file => {
		if (!path.isAbsolute(file)) file = path.join(includePath, file);

		if (fs.existsSync(file)) return fs.statSync(file);
	};

	sandbox.setIncludePath = newPath => {
		includePath = path.join(path.dirname(root.filename), newPath);
	};

	sandbox.include = file => {
		try {
			included[file] = true;

			if (!path.isAbsolute(file)) file = path.join(includePath, file);

			data = fs.readFileSync(file);

			vm.runInNewContext(data, sandbox, {
				filename: "%file%" + file
			});
		} catch (err) {
			sandbox.echo(generateError(err));

			sandbox.exit();
		}
	};

	sandbox.includeOnce = file => {
		if (!included[file]) sandbox.include(file);
	}

	sandbox.sessionStart = () => {
		let cfg = root.getCfg("sessions"),
			name = cfg.name || "JSSSESSID",
			id = "",
			tmp,
			i;

		if (sandbox.COOKIE[name] && root.server.sessions[sandbox.COOKIE[name]]) {
			id = sandbox.COOKIE[name];
		} else {
			for (i = 0; i < 16; ++i) {
				tmp = Math.floor(Math.random() * 256);

				id += ("0" + tmp.toString(16)).slice(-2);
			}

			sandbox.setCookie(name, id);

			root.server.sessions[id] = {};
		}

		sandbox.SESSION = root.server.sessions[id];

		root.server.sessions.lastAccessed[id] = Date.now();

		session = id;
	};

	sandbox.sessionDestroy = all => {
		if (session) {
			root.server.sessions[session] = null;
			root.server.sessions.lastAccessed[session] = null;

			sandbox.SESSION = null;

			session = "";

			if (all) {
				root.server.sessions = {
					lastAccessed: {}
				};
			}
		}
	};

	sandbox.mysqlConnect = (conn, cb) => {
		if (!mysql)  mysql = require("mysql");

		dbStream = mysql.createConnection(conn);
		dbStream.connect(err => {
			if (cb) {
				try {
					cb(err);
				} catch (err) {
					sandbox.echo(generateError(err));

					sandbox.exit();
				}
			}
		});
		dbStream.on("error", err => {
			if (err.code === "PROTOCOL_CONNECTION_LOST") {
				root.server.writeNotice("Database connection lost");
			}
		});
	};

	sandbox.mysqlQuery = (query, values, cb) => {
		if (typeof values === "function") {
			cb = values;

			values = null;
		}

		dbStream.query(query, values, (err, results) => {
			if (cb) {
				try {
					cb(results, err);
				} catch (err) {
					sandbox.echo(generateError(err));

					sandbox.exit();
				}
			}
		});
	};

	sandbox.mysqlClose = cb => {
		if (dbStream) {
			dbStream.end(err => {
				if (cb) {
					try {
						cb(err);
					} catch (err) {
						sandbox.echo(generateError(err));

						sandbox.exit();
					}
				}
			});
			dbStream = null;
		}
	};

	sandbox.exit = str => {
		if (!ended) {
			ended = true;

			if (root.cookies.length) root.res.setHeader("Set-Cookie", root.cookies);

			if (session) root.server.sessions[session] = sandbox.SESSION;

			if (str) sandbox.echo(str);

			root.sendData(output, headers, cache);

			sandbox.mysqlClose();
		}
	};

	try {
		vm.runInNewContext(data, sandbox, {
			filename: "%file%" + root.filename
		});
	} catch (err) {
		output = generateError(err);

		sandbox.exit();
	}
};