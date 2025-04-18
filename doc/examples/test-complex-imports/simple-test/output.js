// .hql-cache/doc/examples/test-complex-imports/simple-test/a.ts
function aFunction() {
  return 15;
}

// .hql-cache/doc/examples/test-complex-imports/simple-test/b.ts
function bFunction() {
  return aFunction() * 2;
}

// .hql-cache/doc/examples/test-complex-imports/simple-test/entry.ts
console.log("Simple test result:", bFunction());
