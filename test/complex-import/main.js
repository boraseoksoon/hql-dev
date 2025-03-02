
  // HQL Core Functions
  function createList(...items) { return Array.from(items); }
  function createVector(...items) { return [...items]; }
  function createMap(entries) { return Object.fromEntries(entries); }
  function createSet(...items) { return new Set(items); }
  
  // Helper function for string operations
  function str(...args) { return args.join(''); }
  
import * as configMod_module from "./config/main-config.js";
const configMod = configMod_module.default !== undefined ? configMod_module.default : configMod_module;
import * as utilsMod_module from "./utils/string-utils.js";
const utilsMod = utilsMod_module.default !== undefined ? utilsMod_module.default : utilsMod_module;
import * as mathMod_module from "./utils/math/operations.js";
const mathMod = mathMod_module.default !== undefined ? mathMod_module.default : mathMod_module;
import * as jsHelperMod_module from "./helpers/js-helper.js";
const jsHelperMod = jsHelperMod_module.default !== undefined ? jsHelperMod_module.default : jsHelperMod_module;
import * as dateMod_module from "./utils/date-formatter.js";
const dateMod = dateMod_module.default !== undefined ? dateMod_module.default : dateMod_module;
import * as pathMod_module from "https://deno.land/std@0.170.0/path/mod.ts";
const pathMod = pathMod_module.default !== undefined ? pathMod_module.default : pathMod_module;
import * as fsMod_module from "https://deno.land/std@0.170.0/fs/mod.ts";
const fsMod = fsMod_module.default !== undefined ? fsMod_module.default : fsMod_module;
import * as jsr1_module from "jsr:@std/path@1.0.8";
const jsr1 = jsr1_module.default !== undefined ? jsr1_module.default : jsr1_module;
import * as jsr2_module from "jsr:@std/fs@1.0.13";
const jsr2 = jsr2_module.default !== undefined ? jsr2_module.default : jsr2_module;
import * as lodashMod_module from "https://esm.sh/lodash";
const lodashMod = lodashMod_module.default !== undefined ? lodashMod_module.default : lodashMod_module;
import * as momentMod_module from "https://esm.sh/moment";
const momentMod = momentMod_module.default !== undefined ? momentMod_module.default : momentMod_module;
import * as chalkMod_module from "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js";
const chalkMod = chalkMod_module.default !== undefined ? chalkMod_module.default : chalkMod_module;
import * as crypto_module from "https://deno.land/std@0.170.0/node/crypto.ts";
const crypto = crypto_module.default !== undefined ? crypto_module.default : crypto_module;
const supportedFormats = ["json", "xml", "yaml", "csv", "text"];
const numericValues = [10, 20, 30, 40, 50];
const defaultSettings = {
  timeout: 30000,
  retries: 3,
  verbose: false,
  format: supportedFormats[0]
};
const itemsList = ["apple", "banana", "cherry", "date"];
const currentDate = new Date();
const mySet = new Set([1, 2, 3, 3, 4, 5, 5]);
const LogLevel = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  critical: "critical"
};
function greet(name) { return `Hello, ${name}!`; }
function calculateArea(params) {
  const { width, height } = params;
  return (width * height);
}
function formatUser(params) {
  const { first, last, title } = params;
  return `${title} ${first} ${last}`;
}
function processPath(filePath) {
  {
  const dirName = pathMod.dirname(filePath);
  const baseName = pathMod.basename(filePath);
  const extension = pathMod.extname(filePath);
  const exists = fsMod.existsSync(filePath);
  return {
  dir: dirName,
  base: baseName,
  ext: extension,
  exists: exists,
  formatted: jsHelperMod.formatPathInfo(dirName, baseName, extension)
};
}
}
function classifyNumber(num) {
  return (num < 0) ? "negative" : (num = 0) ? "zero" : (num > 0) ? "positive" : true ? "unknown" : null;
}
const multiply = function(a, b) { return (a * b); };
function makeAdder(n) { return function(x) { return (x + n); }; }
const addFive = makeAdder(5);
function generateReport(data, format) {
  {
  const timestamp = dateMod.formatCurrentDate("yyyy-MM-dd HH:mm:ss");
  const id = crypto.randomUUID();
  const upperName = lodashMod.upperCase(data.name);
  const formattedData = utilsMod.formatData(data, format);
  const config = configMod.getConfig(format);
  const mathResult = mathMod.calculate(data.value, 10);
  return {
  id: id,
  timestamp: timestamp,
  name: upperName,
  data: formattedData,
  config: config,
  calculation: mathResult
};
}
}
function coloredLog(message, level) {
  return (level = LogLevel.debug) ? chalkMod.blue(message) : (level = LogLevel.info) ? chalkMod.green(message) : (level = LogLevel.warn) ? chalkMod.yellow(message) : (level = LogLevel.error) ? chalkMod.red(message) : (level = LogLevel.critical) ? chalkMod.bgRed(chalkMod.white(message)) : true ? message : null;
}
function processCollection(items) {
  {
  const chunked = lodashMod.chunk(items, 2);
  const shuffled = lodashMod.shuffle(items);
  const first = lodashMod.first(items);
  const last = lodashMod.last(items);
  return {
  chunked: chunked,
  shuffled: shuffled,
  first: first,
  last: last
};
}
}
function formatTimeAgo(dateString) { return momentMod.fromNow(dateString); }
function mathDemo(a, b) {
  return {
  add: (a + b),
  subtract: (a - b),
  multiply: (a * b),
  divide: (a / b),
  complex: ((a * b) + (a / b))
};
}
function stringDemo(a, b) {
  return {
  concat: `${a}${b}`,
  ["with-space"]: `${a} ${b}`,
  repeated: `${a}${a}${a}`,
  ["with-number"]: `${a} #${b}`
};
}
function runDemo() {
  {
  const userName = "Alice Smith";
  const userSettings = {
  name: userName,
  path: "./data/user.json",
  value: 42,
  items: itemsList
};
  const processedPath = processPath(userSettings.path);
  const report = generateReport(userSettings, "json");
  const infoMessage = `Generated report for ${userName}`;
  const errorMessage = "Failed to save report " + report.id;
  console.log(coloredLog("Starting demo", LogLevel.info))
  console.log(coloredLog(infoMessage, LogLevel.info))
  console.log(coloredLog(errorMessage, LogLevel.error))
  console.log("Path info:", processedPath)
  console.log("Report:", report)
  console.log("Math demo:", mathDemo(10, 5))
  console.log("String demo:", stringDemo("Hello", "World"))
  console.log("Collection demo:", processCollection(itemsList))
  console.log("Add 5 to 10:", addFive(10))
  console.log("Classify -5:", classifyNumber(-5))
  console.log("Classify 0:", classifyNumber(0))
  console.log("Classify 5:", classifyNumber(5))
  console.log("Area of 10x20 rectangle:", calculateArea({width: 10, height: 20}))
  console.log("Formatted user:", formatUser({first: "John", last: "Doe", title: "Dr."}))
  return console.log(coloredLog("Demo completed", LogLevel.info));
}
}
console.log("=== HQL Comprehensive Demo ===")
runDemo()
export { greet };
export { calculateArea };
export { formatUser };
export { processPath };
export { classifyNumber };
export { generateReport };
export { coloredLog };
export { processCollection };
export { mathDemo };
export { stringDemo };
export { runDemo };
export { supportedFormats };
export { defaultSettings };
