const mod = (function(){
  const exports = {};
  const mod3 = (function(){
  const exports = {};
  function sayBye(name) {
  return "Bye, " + name + "!"
}
exports.sayBye = sayBye;

  return exports;
})();
function sayHi(name) {
  return "Hi, " + name + "! " + mod3.sayBye(name)
}
exports.sayHi = sayHi;

  return exports;
})();
function greet(name) {
  return mod.sayHi(name) + " Welcome to HQL."
}
console.log(greet("Alice"))
export { greet };
