// examples/bug.js
function list(...items) {
  return items;
}
list("console.log", list("str", "Hello, ", name));
