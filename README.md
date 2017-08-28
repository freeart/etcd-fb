```javascript
const etcdfb = require("./index.js");

const options = {};
etcdfb.config("connectStringOrArray", options);

etcdfb.watch("key", (value)=>{
  console.log(value);  
});

```