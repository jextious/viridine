const Form = require("./form-data"),
	ip = require("./ip"),
	statusCodes = require("./status-codes"),
	mime = require("./mime-types"),
	JSS = require("./jss-functions"),
	url = require("url"),
	path = require("path"),
	fs = require("fs"),
	zlib = require("zlib");

class Connection {
	constructor(server, req, res) {
		let tmp;

		if (!req.url) req.url = "/";

		tmp = ip.v4(req.connection.remoteAddress);

		if (server.cfg.block.includes(tmp)) {
			if (server.terminal) console.log("[blocked]", req.url, tmp);

			return;
		}

		if (server.terminal) {
			console.log(
				"[access]",
				req.method,
				req.url,
				tmp
			);
		}

		this.req = req;

		this.res = res;

		this.host = req.headers.host || "";
		this.host = this.host.replace(/:[0-9]+/, "");

		this.cfg = {};

		this.server = server;

		this.cache = {
			location: null,
			cfg: {}
		};

		this.base = "./public";

		this.uri = url.parse(req.url, true);
		this.uri.pathname = this.uri.pathname.replace(/\.\.\//g, "").replace(/\x00/g, "");

		if (this.uri.host) this.host = this.uri.host.replace(/:[0-9]+/, "");

		this.findHost();

		if (this.host === "localhost" || this.host === server.localIP) {
			tmp = this.uri.pathname.split("/");
			if (tmp[1]) this.findHost(tmp[1]);
		}

		this.globalServer = {
			requestTime: Date.now()
		};

		this.globalGet = this.uri.query;

		this.globalPost = {};

		this.globalFiles = {};

		this.globalCookies = {};

		this.cookies = [];

		this.rewritten = false;

		this.rewriteHandler();

		this.filename = path.join(this.base, this.uri.pathname);

		try {
			this.filename = decodeURI(this.filename);
		} catch (err) {
			this.sendErrorPage(500);

			return;
		}

		this.directory = "";

		this.isDirectory = false;

		this.form = null;

		this.timeout = setTimeout(() => this.sendErrorPage(504), this.getCfg("request_timeout") || 60000);

		if (this.findDenied()) return;

		tmp = this.getCfg("return");

		if (tmp) {
			tmp = tmp.split(" ");
			tmp.header = {};
			tmp.body = "";

			if (tmp[0] > 299 && tmp[0] < 400) {
				tmp.header.Location = tmp[1];
			} else {
				tmp.body = tmp.join(" ").substr(tmp[0].length + 1);
			}

			if (statusCodes.codes[tmp[0]]) {
				this.sendErrorPage(tmp[0], tmp.header, tmp.body);

				return;
			}
		}

		fs.stat(this.filename, (err, stats) => {
			if (!err) this.fileMTime = stats.mtime.getTime().toString();

			if (!err && stats.isDirectory()) {
				this.isDirectory = true;

				this.directory = this.filename;

				if (!this.rewritten && !this.uri.pathname.endsWith("/")) {
					tmp = this.uri.path.split("?");
					tmp = {
						Location: tmp[0] + "/" + (tmp[1] ? "?" + tmp[1] : "")
					};

					this.sendErrorPage(301, tmp);

					return;
				}

				this.filename = path.join(this.filename, "index.html");
			} else if (err) {
				this.sendErrorPage(404);

				return;
			}

			if (req.method === "GET") {
				this.sendFile();
			} else if (req.method === "POST") {
				this.form = new Form(this);
			}
		});
	}

	findDenied(cfg) {
		let denied = [
				"all",
				ip.v4(this.req.connection.remoteAddress),
				this.req.connection.remoteAddress,
				this.req.headers["user-agent"]
			],
			deny = !cfg,
			i,
			j;

		if (!cfg) cfg = this.getCfg("deny");

		if (cfg) {
			for (i of cfg) {
				for (j of denied) {
					if (j.match(i)) {
						if (deny) this.sendErrorPage(403);

						return true;
					}
				}
			}
		}

		return false;
	}

	findHost(host) {
		let cfg = this.server.cfg,
			local = host,
			found = false,
			tmp,
			i;

		host = host || this.host;

		tmp = this.server.servers[host];

		if (tmp) {
			if (tmp.root) this.base = tmp.root;

			this.cfg = tmp;

			found = true;
		} else {
			for (i in cfg.servers) {
				if (cfg.servers.hasOwnProperty(i)) {
					if (host === i) {
						if (cfg.servers[i].root) this.base = cfg.servers[i].root;

						this.cfg = cfg.servers[i];

						this.server.servers[host] = cfg.servers[i];

						found = true;

						break;
					}
				}
			}
		}

		if (!local && !found) {
			this.findHost("_");
		} else if (found && local) {
			tmp = this.uri.pathname.split("/");
			tmp.splice(1, 1);

			this.uri.pathname = tmp.join("/") || "";
		}

		if (found && this.server.servers[host].server) {
			host = this.server.servers[host].server;
		}

		if (!this.server.hostData[host]) {
			this.server.hostData[host] = {};
		}

		this.globalData = this.server.hostData[host];

		this.base = path.normalize(this.base);
	}

	rewriteHandler() {
		let i;

		for (i in this.cfg.rewrite) {
			if (this.cfg.rewrite.hasOwnProperty(i)) {
				if (this.uri.pathname.match(i)) {
					this.uri = this.uri.pathname.replace(new RegExp(i), this.cfg.rewrite[i]);

					this.uri = url.parse(this.uri, true);

					Object.assign(this.globalGet, this.uri.query);

					this.rewritten = true;

					break;
				}
			}
		}
	}

	fillServerGlobal() {
		let cookies,
			tmp,
			i;

		this.globalServer.documentRoot = path.join(process.cwd(), this.base);

		this.globalServer.httpHost = this.host;

		this.globalServer.httpReferer = this.req.headers.referer;

		this.globalServer.httpUserAgent = this.req.headers["user-agent"];

		this.globalServer.remoteIPv4 = ip.v4(this.req.connection.remoteAddress);

		this.globalServer.remoteIPv6 = this.req.connection.remoteAddress;

		this.globalServer.requestUri = this.req.url;

		this.globalServer.scriptName = path.join(process.cwd(), this.filename);

		this.globalServer.serverPort = this.server.port;

		if (this.req.headers.cookie) {
			cookies = this.req.headers.cookie.split("; ");

			for (i of cookies) {
				tmp = i.split("=");

				this.globalCookies[tmp[0]] = tmp[1];
			}
		}
	}

	getCfg(value, loc) {
		let tmp;

		if (this.cache.cfg[value] && !loc) return this.cache.cfg[value];

		tmp = this.getLocation(value, loc);

		if (tmp) {
			if (!loc) this.cache.cfg[value] = tmp;

			return tmp;
		} else if (this.cfg[value]) {
			if (!loc) this.cache.cfg[value] = this.cfg[value];

			return this.cfg[value];
		} else {
			if (!loc) this.cache.cfg[value] = this.server.cfg[value];

			return this.server.cfg[value];
		}

		return;
	}

	getLocation(value, loc) {
		let tmp = this.server.cfg.locations,
			i;

		loc = loc || this.filename;

		if (this.cache.location === null) {
			this.cache.location = false;

			for (i in tmp) {
				if (tmp.hasOwnProperty(i)) {
					if (loc.match(new RegExp(i))) {
						this.cache.location = this.cache.location || {};

						Object.assign(this.cache.location, tmp[i]);
					}
				}
			}
		}

		if (!this.cache.location || !this.cache.location[value]) return;

		return this.cache.location[value];
	}

	setHeaders(headers, content) {
		if (this.server.cfg.server_header === "on" && !headers.Server) {
			headers.Server = "Viridine";
		}

		//headers["Content-Length"] = content.length;
		//headers["Content-Range"] = "bytes 0-" + (content.length - 1) + "/" + content.length;

		return headers;
	}

	setCookie(name, value, expire, path, domain, secure, http) {
		let cookie = [];

		if (name.match(/[=,; \t\r\n\013\014]/)) return;

		cookie.push(encodeURIComponent(name) + "=" + encodeURIComponent(value));

		if (domain) cookie.push("Domain=" + domain);

		cookie.push("Path=" + (path || "/"));

		if (expire) cookie.push("Expires=" + new Date(expire));

		if (secure === true) cookie.push("Secure");

		if (http === true) cookie.push("HttpOnly");

		this.cookies.push(cookie.join("; "));
	}

	sendFile(code, headers) {
		let filename = this.filename,
			type = mime.lookup(filename),
			cache = this.getCfg("cache"),
			tmp = {
				"Content-Type": type
			};

		if (headers) {
			headers = Object.assign(headers, tmp);
		} else {
			headers = tmp;
		}

		if (!code && cache.status === "on" && this.filename.match(new RegExp(cache.types))) {
			if (this.fileMTime === this.req.headers["if-modified-since"]) {
				this.sendErrorPage(304);

				return;
			}
		} else {
			cache = null;
		}

		fs.exists(filename, exists => {
			if (!exists) {
				if (filename.match(/.html$/)) {
					this.filename = filename.replace(/\.html$/, ".jss");

					this.sendFile();

					return;
				}

				if (this.isDirectory) {
					this.isDirectory = false;

					if (this.getCfg("public_dir", this.directory) === "on") {
						this.sendDirectory();
					} else {
						this.sendErrorPage(403);
					}

					return;
				}

				this.sendErrorPage(404);

				return;
			}

			if (!type) {
				this.sendErrorPage(666);

				return;
			}

			this.status = code || 200;

			fs.readFile(filename, "binary", (err, data) => {
				if (err) {
					this.sendErrorPage(500);
				} else if (filename.match(/.jss$/)) {
					this.fillServerGlobal();

					JSS(this, data, headers);
				} else {
					this.sendData(data, headers, cache);
				}
			});
		});
	}

	sendData(data, headers, cache) {
		let compress = this.getCfg("compress"),
			encoding = this.req.headers["accept-encoding"] || "";

		if (this.res.finished) return;

		if (compress.status === "on" && this.filename.match(new RegExp(compress.types)) && headers["Content-Encoding"] === undefined) {
			if (encoding.match(/\bgzip\b/)) {
				headers["Content-Encoding"] = "gzip";
			} else if (encoding.match(/\bdeflate\b/)) {
				headers["Content-Encoding"] = "deflate";
			}
		}

		if (cache) {
			headers["Last-Modified"] = this.fileMTime;

			headers["Vary"] = "Accept-Encoding";

			if (cache.expires) headers["Cache-Control"] = "max-age=" + cache.expires;
		}

		if (headers["Content-Encoding"] === "deflate" || headers["Content-Encoding"] === "gzip") {
			zlib[headers["Content-Encoding"]](data, (err, buffer) => {
				this.res.writeHead(this.status, this.setHeaders(headers, buffer));
				this.res.write(buffer, "binary");

				this.res.end(() => this.end());
			});
		} else {
			this.res.writeHead(this.status, this.setHeaders(headers, data));
			this.res.write(data, "binary");

			this.res.end(() => this.end());
		}
	}

	sendDirectory() {
		let dir = this.directory,
			headers = {
				"Content-Type": "text/plain"
			};

		fs.readdir(dir, (err, files) => {
			let body = dir === this.base ? "-- " + this.host : "`-- ..",
				i;

			if (err) {
				this.sendErrorPage(500);

				return;
			}

			for (i = 0; i < files.length; ++i) {
				body += "  \n" + (i < files.length - 1 ? "|-- " : "`-- ") + files[i];
			}

			if (this.res.finished) return;

			this.status = 200;

			this.res.writeHead(this.status,	this.setHeaders(headers, body));
			this.res.write(body);

			this.res.end(() => this.end());
		});
	}

	sendErrorPage(code, headers, body, raw) {
		let page = this.getCfg(code.toString()),
			tmp = {
				"Content-Type": "text/plain"
			};

		if (headers) {
			headers = Object.assign(headers, tmp);
		} else {
			headers = tmp;
		}

		if (page && !raw && !body) {
			this.uri = url.parse(page, true);

			this.globalGet = Object.assign(this.globalGet, this.uri.query);

			this.filename = decodeURI(path.join(this.base, this.uri.pathname));

			fs.exists(this.filename, exists => {
				if (exists) {
					this.sendFile(code, headers);
				} else {
					this.sendErrorPage(code, headers, body, true);
				}
			});

			return;
		}

		if (this.res.finished) return;

		body = body || code + " " + statusCodes.codes[code];

		this.status = code;

		this.res.writeHead(this.status, this.setHeaders(headers, body));
		this.res.write(body);

		this.res.end(() => this.end());
	}

	end() {
		let cb = err => {
				if (err && err.code !== "ENOENT") {
					this.server.writeError("Could not delete " + this.globalFiles[i].path);
				}
			},
			i,
			j;

		if (this.form && this.form.uploaded) {
			for (i in this.globalFiles) {
				if (this.globalFiles.hasOwnProperty(i)) {
					if (this.globalFiles[i].length) {
						for (j of this.globalFiles[i]) {
							fs.unlink(j.path, cb);
						}
					} else {
						fs.unlink(this.globalFiles[i].path, cb);
					}
				}
			}
		}

		this.req.destroy();

		if (this.timeout) {
			clearTimeout(this.timeout);

			this.timeout = null;
		}

		this.server.writeAccess(this);
	}
}

module.exports = Connection;