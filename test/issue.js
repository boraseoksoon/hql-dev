const __module_simple3_157 = (function() {
  const exports = {};
  function sayBye(name) {
    return "Bye, " + name + "!"
  }
  exports.sayBye = sayBye;
  
  return exports;
})();

const __module_simple2_710 = (function() {
  const exports = {};
  const mod3 = __module_simple3_157;
  function sayHi(name) {
    return "Hi, " + name + "! " + mod3.sayBye(name)
  }
  exports.sayHi = sayHi;
  
  return exports;
})();

const mod = __module_simple2_710;
function greet(name) {
  return mod.sayHi(name) + " Welcome to HQL."
}
console.log(greet("Alice"))
export { greet as greet };
