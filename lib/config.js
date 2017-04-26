module.exports = {
	server_header: "on",
	timeout: 120000,
	logs: {
		access: {
			status: "on",
			format: "$ipv4 [$time] \"$request\" $status"
		},
		errors: {
			status: "on",
			format: "$time [$type] $error"
		},
		queue_size: 25,
		dir: "logs"
	},
	compress: {
		status: "on",
		types: ".(txt|html|js|css|jss)$"
	},
	public_dir: "off",
	file_uploads: {
		status: "on",
		dir: "tmp",
		limit: 1048576
	},
	cache: {
		status: "on",
		types: ".(gif|jpe?g|png|js|css)$",
		expires: 604800
	},
	servers: {
		localhost: {
			root: "public"
		}
	},
	locations: {}
};