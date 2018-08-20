var Etcd = require('node-etcd'),
	EventEmitter = require('events');

class Storage extends EventEmitter {
	constructor() {
		super();
		this.connectString = undefined;
		this.conn = null;
		this.whatchers = {};
	}

	config(connectStringOrArray, options) {
		this.connectString = connectStringOrArray;
		this.options = options || {}
		this.options = Object.assign(this.options, { timeout: 5000 })
	}

	registry(name, ttl) {
		this.__keepalive(name, ttl);
	}

	watch(key, cb) {
		key = key[0] == '/' ? key : '/' + key;
		const recursive = key[key.length - 1] == '/' ? true : false;
		this.__connect();
		this.whatchers[key] = this.conn.watcher(key, null, { recursive, maxRetries: 100 });
		this.whatchers[key].on("change", (val) => {
			cb(recursive ? this.__convert(key, val.node) : val.node.value)
		});
		this.whatchers[key].on("error", (err) => {
			this.emit("error", err)
		});
		this.conn.get(key, { recursive, maxRetries: 100 }, (err, val) => {
			if (err) {
				return this.emit("error", err)
			}
			cb(recursive ? this.__convert(key, val.node.nodes) : val.node.value)
		});
	}

	__connect() {
		if (!this.conn) {
			this.conn = new Etcd(this.connectString, this.options);
		}
	}

	__keepalive(name, ttl) {
		this.__connect();
		this.conn.set(name, process.argv.join(" "), { ttl: 60, maxRetries: 100 }, (err) => {
			if (err) {
				this.emit("error", err)
			}
			setTimeout(() => this.__keepalive(name, ttl), 50000);
		});
	}

	__convert(key, nodesOrNode) {
		let nodes = Array.isArray(nodesOrNode) ? nodesOrNode : [nodesOrNode]

		let obj = {};
		nodes.forEach((node) => {
			obj[node.key.replace(key, '')] = node.value;
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