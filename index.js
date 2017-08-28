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
        this.options = options
    }

    registry(name, ttl){
        this.__keepalive(name, ttl);
    }

    watch(key, cb) {
        this.__connect();
        this.whatchers[key] = this.conn.watcher(key);
        this.whatchers[key].on("change", (val) => {
            cb(val.node.value)
        });
        this.whatchers[key].on("error", (err) => {
            this.emit("error", err)
        });
        this.conn.get(key, (err, val) => {
            if (err) {
                return this.emit("error", err)
            }
            cb(val.node.value)
        });
    }

    __connect() {
        if (!this.conn) {
            this.conn = new Etcd(this.connectString, this.options);
        }
    }

    __keepalive(name, ttl) {
        this.__connect();
        this.conn.set(name, process.argv.join(" "), {ttl: 60}, (err) => {
            if (err) {
                this.emit("error", err)
            }
            setTimeout(() => this.__keepalive(name, ttl), 50000);
        });
    }
}

module.exports = new Storage();