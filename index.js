const etcd = require('./lib'),
	EventEmitter = require('events');

class Storage extends EventEmitter {
	constructor() {
		super();
		this.connectString = undefined;
		this.conn = null;
		this.whatchers = {};
	}

	config(connectStringOrArray, options) {
		connectStringOrArray = connectStringOrArray.indexOf("//") == -1 ? `http://${connectStringOrArray}` : connectStringOrArray
		this.connectString = connectStringOrArray;
		this.options = options || {}
		this.options = Object.assign(this.options, { timeout: 5000 })
	}

	refresh(key, opt, cb) {
		key = key[0] == '/' ? key : '/' + key;
		const dir = key[key.length - 1] == '/';
		this.set(key, null, Object.assign({ maxRetries: 100, dir, refresh: true, prevExist: true }, opt || {}), cb)
	}

	set(key, value, opt, cb) {
		key = key[0] == '/' ? key : '/' + key;
		const dir = key[key.length - 1] == '/';
		this.__connect();
		this.conn.set(key, value, Object.assign({ maxRetries: 100, dir }, opt || {}), (err) => {
			if (err) {
				this.emit("error", err)
			}
			cb(err)
		});
	}

	watch(key, cb) {
		key = key[0] == '/' ? key : '/' + key;
		const recursive = key[key.length - 1] == '/';
		this.__connect();
		this.whatchers[key] = this.conn.watcher(key, null, { recursive, maxRetries: 100 });
		this.whatchers[key].on("change", (val) => {
			let newValue;
			if (recursive) {
				newValue = this.__convert(key, val.node)
				if (Object.getOwnPropertyNames(newValue).length === 0) {
					return;
				}
			} else {
				newValue = val.node.value
			}
			cb(newValue)
		});
		this.whatchers[key].on("error", (err) => {
			this.emit("error", err)
		});
		this.conn.get(key, { recursive, maxRetries: 100 }, (err, val) => {
			if (err) {
				if (err.message == "Key not found") {
					return cb(null, {});
				}
				return this.emit("error", err)
			}
			cb(recursive ? this.__convert(key, val.node.nodes) : val.node.value)
		});
	}

	__connect() {
		if (!this.conn) {
			this.conn = etcd({
				url: this.connectString
			})
		}
	}

	__convert(key, nodesOrNode) {
		if (!nodesOrNode) {
			return {}
		}
		let nodes = Array.isArray(nodesOrNode) ? nodesOrNode : [nodesOrNode]

		let obj = {};
		nodes.forEach((node) => {
			if (node.key.indexOf(key) !== -1) {
				obj[node.key.replace(key, '')] = node.value;
			}
		})

		return obj;
	}
}

let instance = null;

class Cache {
	constructor() {
		if (!instance) {
			instance = new Storage();
		}

		return instance;
	}
}

module.exports = new Cache();