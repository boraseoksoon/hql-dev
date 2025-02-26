import chalk from "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js";
function sayHello() {
  return chalk.blue("Hello from JS");
}
export { sayHello };


// Add a default export for the module
export default { name: "hql-module" };
