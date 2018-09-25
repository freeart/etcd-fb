const bind = (fn, me) => function () { return fn.apply(me, arguments); };

const request = require('request'),
	deasync = require('deasync'),
	_ = require('lodash');

const defaultRequestOptions = {
	pool: {
		maxSockets: 100
	},
	followAllRedirects: true
};

const defaultClientOptions = {
	maxRetries: 3
};

class CancellationToken {
	constructor(servers1, maxRetries, retries1, errors1) {
		this.servers = servers1;
		this.maxRetries = maxRetries;
		this.retries = retries1 != null ? retries1 : 0;
		this.errors = errors1 != null ? errors1 : [];
		this.aborted = false;
	}

	setRequest(req) {
		this.req = req
		return this.req;
	}

	isAborted() {
		return this.aborted;
	}

	abort() {
		this.aborted = true;
		if (this.req != null) {
			return this.req.abort();
		}
	}
}

CancellationToken.prototype.cancel = CancellationToken.prototype.abort;

CancellationToken.prototype.wasAborted = CancellationToken.prototype.isAborted;

class Client {
	constructor(hosts, options1, sslopts) {
		this.hosts = hosts;
		this.options = options1;
		this.sslopts = sslopts;
		this._shouldRetry = bind(this._shouldRetry, this);
		this._retry = bind(this._retry, this);
		this._multiserverHelper = bind(this._multiserverHelper, this);
		this["delete"] = bind(this["delete"], this);
		this.patch = bind(this.patch, this);
		this.post = bind(this.post, this);
		this.get = bind(this.get, this);
		this.put = bind(this.put, this);
		this.execute = bind(this.execute, this);
		this.syncmsg = {};
	}

	execute(method, options, callback) {
		let opt;
		let servers;
		let syncResp;
		let token;
		opt = _.defaults(_.clone(options), this.options, defaultRequestOptions, {
			method
		});
		opt.clientOptions = _.defaults(opt.clientOptions, defaultClientOptions);
		servers = _.shuffle(this.hosts);
		token = new CancellationToken(servers, opt.clientOptions.maxRetries);
		syncResp = this._multiserverHelper(servers, opt, token, callback);
		if (options.synchronous === true) {
			return syncResp;
		} else {
			return token;
		}
	}

	put(options, callback) {
		return this.execute("PUT", options, callback);
	}

	get(options, callback) {
		return this.execute("GET", options, callback);
	}

	post(options, callback) {
		return this.execute("POST", options, callback);
	}

	patch(options, callback) {
		return this.execute("PATCH", options, callback);
	}

	_multiserverHelper(servers, options, token, callback) {
		let host;
		let req;
		let reqRespHandler;
		let syncRespHandler;
		host = _.first(servers);
		options.url = `${host}${options.path}`;
		if (token.isAborted()) {
			return;
		}
		if (host == null) {
			if (this._shouldRetry(token)) {
				return this._retry(token, options, callback);
			}
			return this._error(token, callback);
		}
		reqRespHandler = ((_this => (err, resp, body) => {
			if (token.isAborted()) {
				return;
			}
			if (_this._isHttpError(err, resp)) {
				token.errors.push({
					server: host,
					httperror: err,
					httpstatus: resp != null ? resp.statusCode : void 0,
					httpbody: resp != null ? resp.body : void 0,
					response: resp,
					timestamp: new Date()
				});
				return _this._multiserverHelper(_.drop(servers), options, token, callback);
			}
			return _this._handleResponse(err, resp, body, callback);
		}))(this);
		syncRespHandler = ((_this => (err, body, headers) => {
			options.syncdone = true;
			_this.syncmsg = {
				err,
				body,
				headers
			};
		}))(this);
		if (options.synchronous === true) {
			callback = syncRespHandler;
		}
		req = this._doRequest(options, reqRespHandler);
		token.setRequest(req);
		if (options.synchronous === true && options.syncdone === void 0) {
			options.syncdone = false;
			deasync.loopWhile(((_this => () => !options.syncdone))(this));
			delete options.syncdone;
			return this.syncmsg;
		} else {
			return req;
		}
	}

	_doRequest(options, reqRespHandler) {
		return request(options, reqRespHandler);
	}

	_retry(token, options, callback) {
		let doRetry;
		let waitTime;
		doRetry = ((_this => () => _this._multiserverHelper(token.servers, options, token, callback)))(this);
		waitTime = this._waitTime(token.retries);
		token.retries += 1;
		return setTimeout(doRetry, waitTime);
	}

	_waitTime(retries) {
		if (process.env.RUNNING_UNIT_TESTS === 'true') {
			return 1;
		}

		/* !pragma no-coverage-next */
		return 100 * (16 ** retries);
	}

	_shouldRetry(token) {
		return token.retries < token.maxRetries && this._isPossibleLeaderElection(token.errors);
	}

	_error(token, callback) {
		let error;
		error = new Error('All servers returned error');
		error.errors = token.errors;
		error.retries = token.retries;
		if (callback) {
			return callback(error);
		}
	}

	_isPossibleLeaderElection(errors) {
		let checkError;
		checkError = e => {
			let ref;
			let ref1;
			let ref2;
			let ref3;
			return ((ref = e != null ? (ref1 = e.httperror) != null ? ref1.code : void 0 : void 0) === 'ECONNREFUSED' || ref === 'ECONNRESET') || ((ref2 = e != null ? (ref3 = e.httpbody) != null ? ref3.errorCode : void 0 : void 0) === 300 || ref2 === 301) || /Not current leader/.test(e != null ? e.httpbody : void 0);
		};
		return (errors != null) && _.every(errors, checkError);
	}

	_isHttpError(err, resp) {
		return err || (((resp != null ? resp.statusCode : void 0) != null) && resp.statusCode >= 500);
	}

	_handleResponse(err, resp, body, callback) {
		if (err) {
			return callback(err)
		}
		let error;
		if (callback == null) {
			return;
		}
		if ((body != null ? body.errorCode : void 0) != null) {
			error = new Error((body != null ? body.message : void 0) || 'Etcd error');
			error.errorCode = body.errorCode;
			error.error = body;
			return callback(error, "", (resp != null ? resp.headers : void 0) || {});
		} else {
			return callback(null, body, (resp != null ? resp.headers : void 0) || {});
		}
	}
}

Client.prototype["delete"] = function (options, callback) {
	return this.execute("DELETE", options, callback);
};

exports = module.exports = Client;
