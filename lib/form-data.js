const mime = require("./mime-types"),
	fs = require("fs"),
	os = require("os"),
	path = require("path"),
	url = require("url");

class FormData {
	constructor(server) {
		let cfg = server.getCfg("file_uploads");

		this.server = server;

		this.buffer = new Buffer("\r\n");

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

				this.boundary = new Buffer(match.length + 4);
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
		let buffer = this.buffer;

		buffer = buffer.toString();
		buffer = buffer.replace(/\r\n/g, "");

		this.server.POST = url.parse("/?" + buffer, true).query;

		this.server.sendFile();
	}

	multipart() {
		let cfg = this.server.getCfg("file_uploads"),
			part = {},
			boundary = this.boundary,
			buffer = this.buffer,
			bIdx = 0,
			idx = 0,
			field,
			value,
			match,
			chr,
			state = arguments[1] || 0,
			s = {
				BOUNDARY: 0,
				HEADER_START: 1,
				FIELD: 2,
				VALUE: 3
			},
			i;

		if (this.server.res.finished) {
			return void 0;
		}

		for (i = arguments[0] || 0; i < buffer.length; ++i) {
			chr = buffer[i];

			switch (state) {
			case s.BOUNDARY:
				if (bIdx && chr !== boundary[bIdx]) {
					bIdx = 0;
				}

				if (chr === boundary[bIdx]) {
					++bIdx;

					if (bIdx === boundary.length) {
						state = s.HEADER_START;

						if (part.name) {
							part.data = buffer.slice(idx, i + 1 - bIdx);

							if (part.filename && cfg.status === "on") {
								this.writeFile(cfg.dir, part, i, state);

								return void 0;
							} else if (!part.filename) {
								if (part.data.length) {
									part.data = part.data.toString();

									this.server.POST[part.name] = part.data;
								}
							}
						}
					}
				}

				break;

			case s.HEADER_START:
				if ((chr === 13 && buffer[i + 1] === 10) ||
						(chr === 45 && buffer[i + 1] === 45)) {
					state = s.FIELD;

					idx = i + 2;

					bIdx = 0;

					part = {
						name: "",
						filename: "",
						data: ""
					};
				}

				break;

			case s.FIELD:
				if (chr === 58) {
					field = buffer.slice(idx, i).toString().toLowerCase();

					state = s.VALUE;

					idx = i + 1;

					if (buffer[i + 1] === 32) {
						++idx;
					}
				}

				break;

			case s.VALUE:
				if (chr === 13 && buffer[i + 1] === 10) {
					value = buffer.slice(idx, i).toString();

					if (field === "content-disposition") {
						match = value.match(/name="([^"]*)"/i);

						if (match) {
							part.name = match[1];
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
						state = s.BOUNDARY;
						idx = i + 4;
					} else {
						state = s.FIELD;
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
				tmp.name = part.filename;
				tmp.tmp_name = name;
				tmp.size = part.data.length;
				tmp.type = mime.lookup(part.filename);

				this.server.FILES[part.name] = tmp;

				this.uploaded = true;
			} else {
				this.server.server.writeError("Could not upload file " + name);
			}

			this.multipart(iterator, state);
		});
	}
}

module.exports = FormData;