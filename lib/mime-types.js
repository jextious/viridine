let path = require("path");

exports.lookup = filename => {
	let ext = path.extname(filename).substr(1),
		mime = "";

	if (exports.types[ext]) {
		mime = exports.types[ext];
	}

	return mime;
};

exports.types = {
	"7z": "application/x-7z-compressed",
	"bat": "application/octet-stream",
	"bmp": "image/bmp",
	"css": "text/css",
	"exe": "application/octet-stream",
	"flv": "video/x-flv",
	"gif": "image/gif",
	"htm": "text/html",
	"html": "text/html",
	"ico": "image/x-icon",
	"jpg": "image/jpeg",
	"jpeg": "image/jpeg",
	"js": "application/javascript",
	"jss": "text/html",
	"json": "application/json",
	"mid": "audio/midi",
	"midi": "audio/midi",
	"mp3": "audio/mpeg",
	"ogg": "audio/ogg",
	"pdf": "application/pdf",
	"png": "image/png",
	"rar": "application/x-rar-compressed",
	"rss": "application/rss+xml",
	"sql": "application/x-sql",
	"txt": "text/plain",
	"wav": "audio/x-wav",
	"webm": "image/webm",
	"webp": "image/webp",
	"zip": "application/zip"
};