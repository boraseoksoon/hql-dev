// ../.hql-cache/doc/examples/test-complex-imports/simple-test/b.ts
import { aFunction } from "[BUNDLED]";
function bFunction() {
  return aFunction() * 2;
}

// ../.hql-cache/doc/examples/test-complex-imports/simple-test/entry.ts
console.log("Simple test result:", bFunction());
