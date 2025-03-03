import * as mod_module from "./simple2.js";
const mod = mod_module.default !== undefined ? mod_module.default : mod_module;
import * as strUtil_module from "https://esm.sh/lodash";
const strUtil = strUtil_module.default !== undefined ? strUtil_module.default : strUtil_module;
import * as chalk_module from "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js";
const chalk = chalk_module.default !== undefined ? chalk_module.default : chalk_module;
import * as chalk2_module from "jsr:@nothing628/chalk";
const chalk2 = chalk2_module.default !== undefined ? chalk2_module.default : chalk2_module;
import * as lodash_module from "https://esm.sh/lodash";
const lodash = lodash_module.default !== undefined ? lodash_module.default : lodash_module;
import * as pathModule_module from "https://deno.land/std@0.170.0/path/mod.ts";
const pathModule = pathModule_module.default !== undefined ? pathModule_module.default : pathModule_module;
import * as datetime_module from "https://deno.land/std@0.170.0/datetime/mod.ts";
const datetime = datetime_module.default !== undefined ? datetime_module.default : datetime_module;
import * as uuidModule_module from "https://deno.land/std@0.170.0/uuid/mod.ts";
const uuidModule = uuidModule_module.default !== undefined ? uuidModule_module.default : uuidModule_module;
function greet(name) {
  return mod.sayHi(name) + " Welcome to HQL.";
}
console.log(greet("Alice"))
function greetRemote(name) {
  return strUtil.upperCase("Hello, ") + name + "!";
}
function greetTwice(name) {
  return greetRemote(name) + " " + greetRemote(name);
}
console.log(greetRemote("jss"))
console.log(chalk.blue("hello hql!"))
console.log(chalk2.red("hello hql?"))
console.log(lodash.chunk([1, 2, 3, 4, 5, 6], 2))
console.log("====== Data Structures ======")
const myvec = [10, 20, 30, 40];
console.log(myvec)
const mymap = {a: 100, b: 200};
console.log(mymap)
const myset = new Set([1, 2, 3]);
console.log(myset.size)
console.log("====== Standard Library Demo ======")
const join = pathModule.join;
console.log(join("foo", "bar", "baz.txt"))
const format = datetime.format;
console.log(format(new Date(), "yyyy-MM-dd HH:mm:ss"))
const generate = uuidModule.v4;
console.log(generate)
console.log("====== New Special Form Test ======")
const arr = new Array(1, 2, 3);
console.log(arr)
console.log("====== Arithmetic Operations ======")
const add = function(a, b) { return (a + b); };
console.log(add(3, 4))
const inc = function(n) { return (n + 1); };
console.log(inc(10))
console.log("====== New Syntax (defn) Demo ======")
function addN(x, y) { return (x + y); }
console.log(addN(2, 3))
function minus(params) {
  const { x, y } = params;
  return (x - y);
}
console.log(minus({x: 100, y: 20}))
console.log("====== Sync/Async Exports ======")
const syncAdd = function(params) {
  const { x, y } = params;
  return (x + y);
};
const syncMinus = function(params) {
  const { x, y } = params;
  return (x - y);
};
export { syncAdd };
export { syncMinus };
const add2 = function(x, y) { return (x + y); };
const minus2 = function(x, y) { return (x - y); };
export { add2 };
export { minus2 };
const Destination = { hlvm: "hlvm", macos: "macos", ios: "ios" };
function send(params) {
  const { message, to } = params;
  return message;
}
function send2(params) {
  const { message, to } = params;
  return message;
}
console.log(send({message: "hello1", to: "hlvm"}))
console.log(send2({message: "hello2", to: Destination.hlvm}))
console.log("====== String Interpolation Demo ======")
const name = "Charlie";
const greeting = `hello my name is ${name} and welcome!`;
console.log(greeting)
export { greet };
export { greetTwice };
console.log("====== Named Parameter Tests ======")
function calculateArea(params) {
  const { width, height } = params;
  return (width * height);
}
console.log("Area of 5x10 rectangle: ", calculateArea({width: 5, height: 10}))
function formatName(params) {
  const { first, last, title } = params;
  return `${title} ${first} ${last}`;
}
console.log("Formatted name: ", formatName({first: "Jane", last: "Doe", title: "Dr."}))
function point3d(x, y, z) { return [x, y, z]; }
console.log("3D Point: ", point3d(10, 20, 30))
function applyTax(params) {
  const { amount, rate } = params;
  return (amount * (1 + (rate / 100)));
}
function calculateTotal(params) {
  const { price, qty, taxRate } = params;
  return applyTax({amount: (price * qty), rate: taxRate});
}
console.log("Total price with tax: ", calculateTotal({price: 19.99, qty: 3, taxRate: 8.5}))
function makeAdder(params) {
  const { increment } = params;
  return function(x) { return (x + increment); };
}
const add5 = makeAdder({increment: 5});
console.log("Result of add5(10): ", add5(10))
function complexMath(params) {
  const { a, b, c } = params;
  return ((a * b) + (c / (a + b)));
}
console.log("Complex math result: ", complexMath({a: 5, b: 3, c: 30}))
function processData(params) {
  const { data, options } = params;
  return (data * options.factor);
}
console.log("Processed data: ", processData({data: 100, options: {factor: 1.5}}))
export { calculateArea };
export { formatName };
export { calculateTotal };
export { complexMath };
export { processData };
