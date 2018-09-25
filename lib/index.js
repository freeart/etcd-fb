const bind = (fn, me) => function () { return fn.apply(me, arguments); };

const _ = require('lodash'),
	Watcher = require('./watcher'),
	Client = require('./client'),
	URL = require('url-parse');

class Etcd {
	constructor(hosts, options) {
		if (hosts == null) {
			hosts = "127.0.0.1:2379";
		}
		if (options == null) {
			options = {};
		}
		this.watcher = bind(this.watcher, this);
		this.hosts = this._cleanHostList(hosts);
		this.client = new Client(this.hosts, options, null);
	}

	set(key, value, options, callback) {
		let opt;
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		opt = this._prepareOpts(`keys/${this._stripSlashPrefix(key)}`, "/v2", value, options);
		return this.client.put(opt, callback);
	}

	setSync(key, value, options) {
		if (options == null) {
			options = {};
		}
		return this.set(key, value, this._synchronousOpts(options));
	}

	get(key, options, callback) {
		let opt;
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		opt = this._prepareOpts(`keys/${this._stripSlashPrefix(key)}`, "/v2", null, options);
		return this.client.get(opt, callback);
	}

	getSync(key, options) {
		if (options == null) {
			options = {};
		}
		return this.get(key, this._synchronousOpts(options));
	}

	create(dir, value, options, callback) {
		let opt;
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		opt = this._prepareOpts(`keys/${this._stripSlashPrefix(dir)}`, "/v2", value, options);
		return this.client.post(opt, callback);
	}

	del(key, options, callback) {
		let opt;
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		opt = this._prepareOpts(`keys/${this._stripSlashPrefix(key)}`, "/v2", null, options);
		return this.client["delete"](opt, callback);
	}

	delSync(key, options) {
		if (options == null) {
			options = {};
		}
		return this.del(key, this._synchronousOpts(options));
	}

	mkdir(dir, options, callback) {
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		options.dir = true;
		return this.set(dir, null, options, callback);
	}

	mkdirSync(dir, options) {
		if (options == null) {
			options = {};
		}
		return this.mkdir(dir, this._synchronousOpts(options));
	}

	rmdir(dir, options, callback) {
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		options.dir = true;
		return this.del(dir, options, callback);
	}

	rmdirSync(dir, options) {
		if (options == null) {
			options = {};
		}
		return this.rmdir(dir, this._synchronousOpts(options));
	}

	compareAndSwap(key, value, oldvalue, options, callback) {
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		if (options == null) {
			options = {};
		}
		options.prevValue = oldvalue;
		return this.set(key, value, options, callback);
	}

	compareAndDelete(key, oldvalue, options, callback) {
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		if (options == null) {
			options = {};
		}
		options.prevValue = oldvalue;
		return this.del(key, options, callback);
	}

	raw(method, key, value, options, callback) {
		let opt;
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		opt = this._prepareOpts(key, "", value, options);
		return this.client.execute(method, opt, callback);
	}

	watch(key, options, callback) {
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		if (options == null) {
			options = {};
		}
		options.wait = true;
		return this.get(key, options, callback);
	}

	watchIndex(key, index, options, callback) {
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		if (options == null) {
			options = {};
		}
		options.waitIndex = index;
		return this.watch(key, options, callback);
	}

	watcher(key, index, options) {
		if (index == null) {
			index = null;
		}
		if (options == null) {
			options = {};
		}
		return new Watcher(this, key, index, options);
	}

	machines(callback) {
		let opt;
		opt = this._prepareOpts("keys/_etcd/machines");
		return this.client.get(opt, callback);
	}

	getHosts() {
		return _.clone(this.hosts);
	}

	leader(callback) {
		let opt;
		opt = this._prepareOpts("leader");
		return this.client.get(opt, callback);
	}

	leaderStats(callback) {
		let opt;
		opt = this._prepareOpts("stats/leader");
		return this.client.get(opt, callback);
	}

	selfStats(callback) {
		let opt;
		opt = this._prepareOpts("stats/self");
		return this.client.get(opt, callback);
	}

	version(callback) {
		let opt;
		opt = this._prepareOpts("version", "");
		return this.client.get(opt, callback);
	}

	refresh(key, options, callback) {
		let opt;
		let ref;
		ref = this._argParser(options, callback);
		options = ref[0];
		callback = ref[1];
		let clientOptions;
		let queryString;
		queryString = _.omit(options, 'maxRetries', 'synchronous', 'ttl');
		clientOptions = _.pick(options, 'maxRetries');
		opt = {
			path: `/v2/keys/${this._stripSlashPrefix(key)}`,
			json: true,
			qs: queryString,
			clientOptions,
			synchronous: options.synchronous,
			form: {
				ttl: options.ttl || 60,
				refresh: 'true',
				prevExist: 'true'
			},
			agentOptions: this.sslopts != null ? this.sslopts : void 0
		};
		return this.client.put(opt, callback);
	}

	_stripSlashPrefix(key) {
		return key.replace(/^\//, '');
	}

	_synchronousOpts(options) {
		return _.extend({}, options, {
			synchronous: true
		});
	}

	_prepareOpts(path, apiVersion, value, allOpts) {
		let clientOptions;
		let opt;
		let queryString;
		if (apiVersion == null) {
			apiVersion = "/v2";
		}
		if (value == null) {
			value = null;
		}
		if (allOpts == null) {
			allOpts = {};
		}
		queryString = _.omit(allOpts, 'maxRetries', 'synchronous');
		clientOptions = _.pick(allOpts, 'maxRetries');
		opt = {
			path: `${apiVersion}/${path}`,
			json: true,
			qs: queryString,
			clientOptions,
			synchronous: allOpts.synchronous,
			form: value != null ? { value } : void 0,
			agentOptions: this.sslopts != null ? this.sslopts : void 0
		};
		return opt;
	}

	_argParser(options, callback) {
		if (options == null) {
			options = {};
		}
		if (typeof options === 'function') {
			return [{}, options];
		} else {
			return [options, callback];
		}
	}

	_cleanHostList(hosts) {
		let hostlist;
		hostlist = _.isArray(hosts) ? hosts : [hosts];
		return hostlist.map(host => {
			let url;
			url = new URL(host);
			if (url.protocol === '') {
				url.set('protocol', 'http:');
			}
			return url.href.replace(/\/$/, "");
		});
	}
}

Etcd.prototype.post = Etcd.prototype.create;

Etcd.prototype["delete"] = Etcd.prototype.del;

Etcd.prototype.testAndSet = Etcd.prototype.compareAndSwap;

Etcd.prototype.testAndDelete = Etcd.prototype.compareAndDelete;

exports = module.exports = Etcd;
