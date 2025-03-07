import * as modModule from "https://deno.land/std@0.170.0/path/mod.ts";
const mod = modModule.default !== undefined ? modModule.default : modModule;
const greeting = "Hello, HQL!";
const check = ((5 === 5) ? "Yes, equals" : "No, not equals");
const square = function(x) {
  return (x * x);
};
const result = square(8);
const path = mod;
const joined = path.join("folder", "file.txt");
const doubled = function(x) {
  return (2 * x);
}(21);
export { greeting };
export { check };
export { result };
export { joined };
export { doubled };