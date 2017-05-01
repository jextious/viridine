let vm = require("vm"),
	path = require("path"),
	fs = require("fs"),
	mysql;

module.exports = (root, data, headers) => {
	let output = "",
		cache = null,
		ended = false,
		connection,
		sandbox = {
			COOKIE: {}
		},
		i;

	sandbox.SERVER = root.SERVER;

	sandbox.GET = root.GET;

	sandbox.POST = root.POST;

	sandbox.FILES = root.FILES;

	for (i in root.COOKIES) {
		if (root.COOKIES.hasOwnProperty(i)) {
			sandbox.COOKIE[i] = decodeURIComponent(root.COOKIES[i]);
		}
	}

	sandbox.echo = str => {
		output += str;
	};

	sandbox.print_r = arr => {
		output += JSON.stringify(arr);
	};

	sandbox.header = (name, value) => {
		headers[name] = value;

		if (name.toLowerCase() === "location" && root.status != 201 &&
				(root.status < 300 || root.status > 399)) {
			root.status = 302;
		}
	};

	sandbox.setCache = (bool, time) => {
		cache = null;

		if (bool) {
			cache = {
				expires: time
			};
		}
	};

	sandbox.setCookie = (name, value, expire, path, domain, secure, http) => {
		root.setCookie(name, value, expire, path, domain, secure, http);
	};

	sandbox.setStatus = code => {
		root.status = code;
	};

	sandbox.file_rename = (oldPath, newPath) => {
		fs.renameSync(oldPath, newPath);
	};

	sandbox.file_exists = file => {
		if (!path.isAbsolute(file)) {
			file = path.join(path.dirname(root.filename), file);
		}

		return fs.existsSync(file);
	};

	sandbox.file_get_contents = file => {
		let data = "Error: could not find file " + file;

		if (!path.isAbsolute(file)) {
			file = path.join(path.dirname(root.filename), file);
		}

		if (fs.existsSync(file)) {
			data = fs.readFileSync(file);
		}

		return data;
	};

	sandbox.include = file => {
		try {
			if (!path.isAbsolute(file)) {
				file = path.join(path.dirname(root.filename), file);
			}

			data = fs.readFileSync(file);

			vm.runInNewContext(data, sandbox);
		} catch (err) {
			sandbox.echo(err.message.toString());

			sandbox.exit();
		}
	};

	sandbox.mysql_connect = (conn, cb) => {
		if (!mysql) {
			mysql = require("mysql");
		}

		connection = mysql.createConnection(conn);
		connection.connect(err => {
			if (err) {
				sandbox.echo(err.message.toString());

				sandbox.exit();
			} else if (cb) {
				try {
					cb();
				} catch (err) {
					sandbox.echo(err.toString());

					sandbox.exit();
				}
			}
		});
	};

	sandbox.mysql_query = (query, values, cb) => {
		connection.query(query, values, (err, results) => {
			if (err) {
				sandbox.echo(err.message.toString());

				sandbox.exit();
			} else if (cb) {
				try {
					cb(results);
				} catch (err) {
					sandbox.echo(err.toString());

					sandbox.exit();
				}
			}
		});
	};

	sandbox.mysql_close = cb => {
		if (connection) {
			connection.end(err => {
				if (err) {
					sandbox.echo(err.message.toString());

					sandbox.exit();
				} else if (cb) {
					try {
						cb();
					} catch (err) {
						sandbox.echo(err.toString());

						sandbox.exit();
					}
				}
			});
			connection = null;
		}
	};

	sandbox.exit = () => {
		if (!ended) {
			ended = true;

			if (root.cookies.length) {
				root.res.setHeader("Set-Cookie", root.cookies);
			}

			root.sendData(output, headers, cache);

			sandbox.mysql_close();
		}
	};

	try {
		vm.runInNewContext(data, sandbox);
	} catch (err) {
		output = err.toString();

		sandbox.exit();
	}
};