const mime = require("./mime-types"),
	fs = require("fs"),
	os = require("os"),
	path = require("path");

function urlDecode(str) {
	str = str || "";
	str = str.replace(/\+/g, " ");
	str = decodeURIComponent(str);

	return str;
}

class Form {
	constructor(server) {
		let cfg = server.getCfg("file_uploads");

		this.server = server;

		this.buffer = Buffer.from("\r\n");

		this.type = "";

		this.boundary = "";

		this.bytesReceived = 0;

		this.maxBytes = cfg.limit || 1048576;

		if (cfg.status !== "on") {
			this.maxBytes = 0;
		}

		this.uploaded = false;

		this.headers(() => {
			server.req.on("data", data => {
				this.write(data);
			}).on("end", () => {
				this.end();
			});
		});
	}

	headers(cb) {
		let header = this.server.req.headers["content-type"],
			match;

		if (header && header.match(/urlencoded/i)) {
			this.type = "urlencoded";
		}

		if (header && header.match(/multipart/i)) {
			this.type = "multipart";

			match = header.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

			if (match) {
				match = match[1] || match[2];

				this.boundary = Buffer.alloc(match.length + 4);
				this.boundary.write("\r\n--", 0);
				this.boundary.write(match, 4);
			} else {
				this.server.sendErrorPage(500);

				return void 0;
			}
		}

		cb();
	}

	write(data) {
		this.bytesReceived += data.length;

		if (this.bytesReceived > this.maxBytes) {
			this.server.sendErrorPage(413);

			return void 0;
		}

		this.buffer = Buffer.concat([this.buffer, data]);
	}

	end() {
		if (this.server.res.finished) {
			return void 0;
		}

		if (this.type === "urlencoded") {
			this.urlencoded();
		}

		if (this.type === "multipart") {
			this.multipart();
		}
	}

	urlencoded() {
		let buffer = this.buffer,
			tmp = {},
			array = false,
			i;

		buffer = buffer.toString();
		buffer = buffer.replace(/\r\n/g, "").split("&");

		for (i of buffer) {
			i = i.split("=");
			i[0] = urlDecode(i[0]);
			i[1] = urlDecode(i[1]);

			if (i[0].slice(-2) === "[]") {
				i[0] = i[0].slice(0, -2);

				array = true;
			} else {
				array = false;
			}

			if (array) {
				if (tmp[i[0]]) {
					if (typeof tmp[i[0]] === "string") {
						tmp[i[0]] = [];
					}

					tmp[i[0]].push(i[1]);
				} else {
					tmp[i[0]] = [i[1]];
				}
			} else {
				tmp[i[0]] = i[1];
			}
		}

		this.server.globalPost = tmp;

		this.server.sendFile();
	}

	multipart(iterator = 0, state = 0) {
		let cfg = this.server.getCfg("file_uploads"),
			post = this.server.globalPost,
			part = {},
			boundary = this.boundary,
			buffer = this.buffer,
			bIdx = 0,
			idx = 0,
			field,
			value,
			match,
			chr,
			tmp,
			states = {
				BOUNDARY: 0,
				HEADER_START: 1,
				FIELD: 2,
				VALUE: 3
			},
			i;

		if (this.server.res.finished) {
			return void 0;
		}

		for (i = iterator; i < buffer.length; ++i) {
			chr = buffer[i];

			switch (state) {
			case states.BOUNDARY:
				if (bIdx && chr !== boundary[bIdx]) {
					bIdx = 0;
				}

				if (chr === boundary[bIdx]) {
					++bIdx;

					if (bIdx === boundary.length) {
						state = states.HEADER_START;

						if (part.name) {
							part.data = buffer.slice(idx, i + 1 - bIdx);

							if (part.filename && cfg.status === "on") {
								this.writeFile(cfg.dir, part, i, state);

								return void 0;
							} else if (part.filename === null) {
								part.data = part.data.toString();

								tmp = typeof post[part.name] === "string";

								if (part.array) {
									if (post[part.name]) {
										if (tmp) {
											post[part.name] = [];
										}

										post[part.name].push(part.data);
									} else {
										post[part.name] = [part.data];
									}
								} else {
									post[part.name] = part.data;
								}
							}
						}
					}
				}

				break;

			case states.HEADER_START:
				if ((chr === 13 && buffer[i + 1] === 10) ||
						(chr === 45 && buffer[i + 1] === 45)) {
					state = states.FIELD;

					idx = i + 2;

					bIdx = 0;

					part = {
						name: null,
						filename: null,
						data: null,
						array: false
					};
				}

				break;

			case states.FIELD:
				if (chr === 58) {
					field = buffer.slice(idx, i).toString().toLowerCase();

					state = states.VALUE;

					idx = i + 1;

					if (buffer[i + 1] === 32) {
						++idx;
					}
				}

				break;

			case states.VALUE:
				if (chr === 13 && buffer[i + 1] === 10) {
					value = buffer.slice(idx, i).toString();

					if (field === "content-disposition") {
						match = value.match(/name="([^"]*)"/i);

						if (match) {
							part.name = match[1];

							if (match[1].slice(-2) === "[]") {
								part.name = match[1].slice(0, -2);
								part.array = true;
							}
						}

						match = value.match(/filename="(.*?)"/i);

						if (match) {
							match = match[1];
							match = match.substr(match.lastIndexOf("\\") + 1);

							part.filename = match;
						}
					} else if (field === "content-type") {
						part.mime = value;
					} else if (field === "content-transfer-encoding") {
						part.transferEncoding = value.toLowerCase();
					}

					if (buffer[i + 2] === 13 && buffer[i + 3] === 10) {
						state = states.BOUNDARY;
						idx = i + 4;
					} else {
						state = states.FIELD;
						idx = i + 2;
					}
				}

				break;
			}
		}

		this.server.sendFile();
	}

	writeFile(dir, part, iterator, state) {
		let name = "upload_",
			files = this.server.globalFiles,
			tmp,
			i;

		for (i = 0; i < 16; ++i) {
			tmp = Math.floor(Math.random() * 256);

			name += ("0" + tmp.toString(16)).slice(-2);
		}

		name = path.join(process.cwd(), dir || os.tmpdir(), name);

		fs.writeFile(name, part.data, err => {
			if (!err) {
				tmp = {};
				tmp.filename = part.filename;
				tmp.path = name;
				tmp.size = part.data.length;
				tmp.type = mime.lookup(part.filename);
				tmp.ext = path.extname(part.filename);

				if (part.array) {
					if (files[part.name]) {
						if (!files[part.name].length) {
							fs.unlinkSync(files[part.name].path);

							files[part.name] = [];
						}

						files[part.name].push(tmp);
					} else {
						files[part.name] = [tmp];
					}
				} else {
					files[part.name] = tmp;
				}

				this.uploaded = true;
			} else {
				this.server.server.writeError("Could not upload file " + name);
			}

			this.multipart(iterator, state);
		});
	}
}

module.exports = Form;