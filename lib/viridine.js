const Connection = require("./connection"),
	welcome = require("./welcome-page"),
	config = require("./config"),
	deepMerge = require("./deep-merge"),
	ip = require("./ip"),
	http = require("http"),
	path = require("path"),
	fs = require("fs"),
	os = require("os");

class Viridine {
	constructor(port = 80, terminal = false) {
		let ifaces = os.networkInterfaces(),
			prev,
			i,
			j;

		this.port = port;

		this.terminal = terminal;

		this.cfg = {};

		this.logs = {};

		this.servers = {};

		this.sessions = {
			lastAccessed: {}
		};

		this.hostData = {};

		for (i of process.argv) {
			if (prev === "-p" || prev === "-port") this.port = +i;

			if (i === "-t" || i === "-terminal") this.terminal = true;

			prev = i;
		}

		for (i in ifaces) {
			if (ifaces.hasOwnProperty(i)) {
				for (j of ifaces[i]) {
					if (j.family === "IPv4" && !j.internal) this.localIP = j.address;
				}
			}
		}

		this.readConf(() => {
			this.defaultSetup(0, () => {
				http.createServer((req, res) => {
					let conn = new Connection(this, req, res);
				}).listen(this.port);

				if (this.terminal) console.log("Running Viridine on port " + this.port);

				this.gc();
			});
		});
	}

	defaultSetup(dir, cb) {
		let dirs = [],
			mkdirCb = err => {
				if (err && err.code !== "EEXIST") {
					this.writeError("Could not create " + dirs[i]);
				} else if (!err) {
					this.writeNotice("Created " + dirs[i]);
				}

				if (!err && i > 1) {
					this.writeIndex(dirs[i], i + 1, cb);
				} else {
					this.defaultSetup(i + 1, cb);
				}
			},
			i;

		dirs.push(this.cfg.logs.dir || "logs");
		dirs.push(this.cfg.file_uploads.dir || "tmp");

		for (i in this.cfg.servers) {
			if (this.cfg.servers.hasOwnProperty(i) && this.cfg.servers[i].root && this.cfg.servers[i].root !== "public") {
				dirs.push(this.cfg.servers[i].root);
			}
		}

		if (dirs.length < 3) dirs.push("public");

		for (i = dir; i < dirs.length; ++i) {
			fs.mkdir(dirs[i], null, mkdirCb);

			return;
		}

		this.emptyTmp(cb);
	}

	emptyTmp(cb) {
		let dir = this.cfg.file_uploads.dir || "tmp";

		fs.readdir(dir, (err, files) => {
			let i;

			for (i of files) {
				fs.unlinkSync(path.join(dir, i));
			}

			if (files && files.length) this.writeNotice("Emptied " + dir);

			if (cb) cb();
		});
	}

	readConf(cb) {
		fs.readFile("./viridine.json", (err, data) => {
			let tmp,
				i;

			if (err) {
				this.writeConf(cb);

				return;
			}

			try {
				data = data.toString();
				data = JSON.parse(data);

				for (i in data.servers) {
					tmp = data.servers[i].server;

					if (data.servers.hasOwnProperty(i) && tmp) {
						data.servers[i] = data.servers[data.servers[i].server];
						data.servers[i].server = tmp;
					}
				}

				for (i in data.locations) {
					if (data.locations.hasOwnProperty(i)) {
						tmp = i.replace(/\//g, "\\\\");

						data.locations[tmp] = {};

						Object.assign(data.locations[tmp], data.locations[i]);

						data.locations[i] = null;
					}
				}

				this.cfg = deepMerge(config, data);

				cb();
			} catch (err) {
				this.cfg = config;

				tmp = "Could not interpret viridine.json: " +
					err.message[0].toLowerCase() + err.message.substr(1);

				this.writeError(tmp, "fatal");
			}
		});
	}

	writeConf(cb) {
		let cfg = JSON.stringify(config, null, 4);

		fs.writeFile("./viridine.json", cfg, err => {
			if (err) {
				this.writeError("Could not create viridine.json", "fatal");
			} else {
				this.writeNotice("Created viridine.json");

				this.readConf(cb);
			}
		});
	}

	writeIndex(dir, iterator, cb) {
		let file = dir + "/index.html",
			output = "",
			i;

		for (i of welcome) {
			i = i.replace("%root%", dir);
			i = i.replace("%logs%", this.cfg.logs.dir || "logs");

			output += i + "\n";
		}

		fs.writeFile(file, output, err => {
			if (err) {
				this.writeError("Could not create " + file);
			} else {
				this.writeNotice("Created " + file);
			}

			this.defaultSetup(iterator, cb);
		});
	}

	writeAccess(conn) {
		let cfg = conn.getCfg("logs"),
			file = (cfg.dir || "logs") + "/access.txt",
			str,
			globalServer = conn.globalServer,
			req = conn.req,
			date;

		if (this.terminal) {
			console.log("[access] Took", Date.now() - globalServer.requestTime, "ms to send", conn.filename);
		}

		if (cfg.access.status === "on" && !conn.findDenied(cfg.access.exclude)) {
			date = new Date(globalServer.requestTime);
			date = date.toLocaleString("en-us");

			str = cfg.access.format;
			str = str.replace("$ipv4", ip.v4(req.connection.remoteAddress));
			str = str.replace("$ipv6", req.connection.remoteAddress);
			str = str.replace("$time", date);
			str = str.replace("$request", conn.req.url);
			str = str.replace("$status", conn.status);
			str = str.replace("$user_agent", req.headers["user-agent"]);

			this.logs[file] = this.logs[file] || [];
			this.logs[file].push(str + "\r\n");
		}
	}

	writeError(msg, type = "error") {
		let cfg = this.cfg.logs,
			file = (cfg.dir || "logs") + "/errors.txt",
			str,
			date;

		if (this.terminal) console.log("[" + type + "] " + msg);

		if (cfg.errors.status === "on") {
			date = new Date();
			date = date.toLocaleString("en-us");

			str = cfg.errors.format;
			str = str.replace("$time", date);
			str = str.replace("$type", type);
			str = str.replace("$error", msg);

			this.logs[file] = this.logs[file] || [];
			this.logs[file].push(str + "\r\n");
		}
	}

	writeNotice(msg) {
		if (this.terminal) console.log("[notice] " + msg);
	}

	gc(exit) {
		let cfg = this.cfg.sessions.max_life || 900000,
			time = Date.now() - cfg,
			i;

		for (i in this.logs) {
			if (this.logs.hasOwnProperty(i) && this.logs[i].length) {
				fs.appendFileSync(i, this.logs[i].join(""));

				this.logs[i].length = 0;
			}
		}

		for (i in this.sessions.lastAccessed) {
			if (this.sessions.lastAccessed.hasOwnProperty(i)) {
				if (this.sessions[i] && this.sessions.lastAccessed[i] < time) {
					this.sessions[i] = null;
					this.sessions.lastAccessed[i] = null;
				}
			}
		}

		cfg = this.cfg.gc_timeout || 300000;

		if (exit !== true) setTimeout(() => this.gc(), cfg);
	}
}

module.exports = Viridine;