const mod3 = (function(){
  const exports = {};
  // Bundled HQL from ./simple3.hql
  return exports;
})();
function sayHi(name) {
  return "Hi, " + name + "! " + mod3.sayBye(name)
}
exports.sayHi = sayHi;
