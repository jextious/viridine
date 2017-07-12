"use strict";

function deepMerge(obj1, obj2) {
	let obj = {},
		objs = [obj1, obj2],
		i,
		j;

	for (i of objs) {
		for (j in i) {
			if (i.hasOwnProperty(j)) {
				if (typeof i[j] === "object" && !(i[j] instanceof Array)) {
					obj[j] = deepMerge(obj[j], i[j]);
				} else {
					obj[j] = i[j];
				}
			}
		}
	}

	return obj;
}

module.exports = deepMerge;