// Module: /Users/seoksoonjang/Desktop/hql/test/simple3.hql
const __module_simple3_8178 = (function() {
  const exports = {};
  function sayBye(name) {
    return "Bye, " + name + "!"
  }
  exports.sayBye = sayBye;
  
  return exports;
})();

// Module: /Users/seoksoonjang/Desktop/hql/test/simple2.hql
const __module_simple2_94 = (function() {
  const exports = {};
  const mod3 = __module_simple3_8178;
  function sayHi(name) {
    return "Hi, " + name + "! " + mod3.sayBye(name)
  }
  exports.sayHi = sayHi;
  
  return exports;
})();

const mod = __module_simple2_94;
function greet(name) {
  return mod.sayHi(name) + " Welcome to HQL."
}
console.log(greet("Alice"))


export { greet };
