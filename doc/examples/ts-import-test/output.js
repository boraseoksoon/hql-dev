// ../doc/examples/ts-import-test/simple.js
function jsFunction(x) {
  return x * 2;
}

// ../.hql-cache/doc/examples/ts-import-test/entry.ts
console.log("JS function result:", jsFunction(10));
export {
  jsFunction
};
