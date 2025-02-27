const mod = (function(){
  const exports = {};
  // bundled HQL module
  return exports;
})();
function greet(name) {
  return mod.sayHi(name) + " Welcome to HQL."
}
console.log(greet("Alice"))
export { greet };
