const mod = (function(){
let exports = {};
const mod3 = (function(){
let exports = {};
function sayBye(name) { return "Bye, " + name + "!"; }
exports.sayBye = sayBye;
return exports;
})();
function sayHi(name) { return "Hi, " + name + "! " + mod3.sayBye(name); }
exports.sayHi = sayHi;
return exports;
})();
function greet(name) { return mod.sayHi(name) + " Welcome to HQL."; }
console.log(greet("Alice"));
import strUtil from "https://esm.sh/lodash";
function greetRemote(name) { return strUtil.upperCase("Hello, ") + name + "!"; }
function greetTwice(name) { return greetRemote(name) + " " + greetRemote(name); }
console.log(greetRemote("jss"));
import chalk from "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js";
console.log(chalk.blue("hello hql!"));
import chalk2 from "jsr:@nothing628/chalk";
console.log(chalk2.red("hello hql?"));
import lodash from "npm:lodash";
console.log(lodash.chunk([1, 2, 3, 4, 5, 6], 2));
import * as simple from "data:text/javascript;base64,Ly8gaW50ZXJvcC5qcwppbXBvcnQgeyBzYXlIZWxsbyB9IGZyb20gImRhdGE6dGV4dC9qYXZhc2NyaXB0O2Jhc2U2NCxhVzF3YjNKMElHTm9ZV3hySUdaeWIyMGdJbWgwZEhCek9pOHZaR1Z1Ynk1c1lXNWtMM2d2WTJoaGJHdGZaR1Z1YjBCMk5DNHhMakV0WkdWdWJ5OXpiM1Z5WTJVdmFXNWtaWGd1YW5NaU93cG1kVzVqZEdsdmJpQnpZWGxJWld4c2J5Z3BJSHNnY21WMGRYSnVJR05vWVd4ckxtSnNkV1VvSWtobGJHeHZJR1p5YjIwZ1NsTWlLVHNnZlFwbGVIQnZjblFnZXlCellYbElaV3hzYnlCaGN5QnpZWGxJWld4c2J5QjlPdz09IjsKY29uc29sZS5sb2coc2F5SGVsbG8oKSk7CmV4cG9ydCB7IHNheUhlbGxvIH07Cg==";
console.log(simple.sayHello);
export { greet as greet };
export { greetTwice as greetTwice };