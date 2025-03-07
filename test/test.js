const greeting = "Hello, HQL!";
const answer = 42;
const today = new Date();
const randomValue = (function(){
  const _obj = Math;
  const _member = _obj["random"];
  return typeof _member === "function" ? _member.call(_obj) : _member;
})();
import * as lodash_module from "npm:lodash";
const lodash = lodash_module.default !== undefined ? lodash_module.default : lodash_module;
import * as path_module from "https://deno.land/std@0.170.0/path/mod.ts";
const path = path_module.default !== undefined ? path_module.default : path_module;
const message = "hello";
const len = (function(){
  const _obj = message;
  const _member = _obj["length"];
  return typeof _member === "function" ? _member.call(_obj) : _member;
})();
const upper = (function(){
  const _obj = message;
  const _member = _obj["toUpperCase"];
  return typeof _member === "function" ? _member.call(_obj) : _member;
})();
const timestamp = (function(){
  const _obj = today;
  const _member = _obj["getTime"];
  return typeof _member === "function" ? _member.call(_obj) : _member;
})();
const joined = (function(){
  const _obj = path;
  const _member = _obj["join"];
  return typeof _member === "function" ? _member.call(_obj, "folder", "file.txt") : _member;
})();
const id = (function(){
  const _obj = lodash;
  const _member = _obj["identity"];
  return typeof _member === "function" ? _member.call(_obj, "example") : _member;
})();
function ok() {
return "OK";
}
export { greeting };
export { upper };
export { timestamp };
export { joined };
export { id };