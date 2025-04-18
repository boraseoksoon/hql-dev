// ../doc/examples/ts-import-test/ts-module.ts
function tsFunction(x) {
  return x * 3;
}

// ../.hql-cache/doc/examples/ts-import-test/entry2.ts
console.log("TS function result:", tsFunction(10));
export {
  tsFunction
};
