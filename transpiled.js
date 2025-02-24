function sayBye(name) { return "Bye, " + name + "!"; }
function sayHi(name) { return "Hi, " + name + "! " + sayBye(name); }
function greet(name) { return sayHi(name) + " Welcome to HQL."; }
console.log(greet("Alice"));
import strUtil from "https://esm.sh/lodash";
function greetRemote(name) { return strUtil.upperCase("Hello, ") + name + "!"; }
function greetTwice(name) { return greetRemote(name) + " " + greetRemote(name); }
function add(x, y) { return x + y; }
function complexGreeting(name, x, y) { return greetTwice(name) + " The sum is: " + add(x, y); }
console.log(greetRemote("jss"));
import chalk from "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js";
console.log(chalk.blue("hello hql!"));
import chalk2 from "jsr:@nothing628/chalk";
console.log(chalk2.red("hello hql?"));
import lodash from "npm:lodash";
console.log(lodash.chunk([1, 2, 3, 4, 5, 6], 2));
export { greet as greet };
export { greetTwice as greetTwice };
export { add as add };
export { complexGreeting as complexGreeting };