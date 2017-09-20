const configStorage = require('./index.js');

configStorage.watch(`common/key`, (config) => {
	console.log("value", config)
});

configStorage.watch(`common/node/`, (config) => {
	console.log("node", config)
});