module.exports = {
	server_header: "on",
	request_timeout: 120000,
	logs: {
		access: {
			status: "on",
			format: "$ipv4 [$time] \"$request\" $status"
		},
		errors: {
			status: "on",
			format: "$time [$type] $error"
		},
		dir: "logs"
	},
	gc_timeout: 300000,
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
	sessions: {
		name: "JSSSESSID",
		max_life: 900000
	},
	servers: {
		localhost: {
			root: "public"
		}
	},
	locations: {}
};