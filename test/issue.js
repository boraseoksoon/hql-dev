const __module_simple3_4595 = (function() {
  const exports = {};
  function sayBye(name) {
    return "Bye, " + name + "!"
  }
  exports.sayBye = sayBye;
  
  return exports;
})();

const __module_simple2_760 = (function() {
  const exports = {};
  const mod3 = __module_simple3_4595;
  function sayHi(name) {
    return "Hi, " + name + "! " + mod3.sayBye(name)
  }
  exports.sayHi = sayHi;
  
  return exports;
})();

const mod = __module_simple2_760;
function greet(name) {
  return mod.sayHi(name) + " Welcome to HQL."
}
console.log(greet("Alice"))
export { greet as greet };
