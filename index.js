var Etcd = require('node-etcd');

class Storage {
    constructor() {
        this.connectString = undefined;
        this.conn = null;
        this.whatchers = {};
    }

    config(connectStringOrArray, options) {
        this.connectString = connectStringOrArray;
        this.options = options
    }

    watch(key, cb) {
        this.__connect();
        this.whatchers[key] = this.conn.watcher(key);
        this.whatchers[key].on("change", (val) => {
            cb(val.node.value)
        });
        this.conn.get(key, (err, val) => {
            if (!err) {
                cb(val.node.value)
            }
        });
    }

    __connect() {
        if (!this.conn) {
            this.conn = new Etcd(this.connectString, this.options);
        }
    }
}

module.exports = new Storage();