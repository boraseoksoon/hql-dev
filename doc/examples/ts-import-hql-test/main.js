import { add, multiply, greet } from "./math.hql";
console.log("TS importing HQL - Add function:", add(5, 10));
console.log("TS importing HQL - Multiply function:", multiply(4, 6));
console.log("TS importing HQL - Greeting:", greet("HQL from TypeScript"));
function combineOperations(a, b) {
  return add(a, multiply(a, b));
}
console.log("Combined operations result:", combineOperations(5, 3));
function operateAndGreet(name, a, b) {
  return `${greet(name)}, result: ${add(a, b)}`;
}
export {
  operateAndGreet
};
