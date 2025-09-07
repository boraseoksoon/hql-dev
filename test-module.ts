// Test the HQL module API
import hql from "./mod.ts";

console.log("HQL version:", hql.version);

const hqlCode = `
(print "Hello from HQL!")
(fn add (x y) (+ x y))
(print (add 10 20))
`;

console.log("Is HQL?", hql.isHQL(hqlCode));

try {
  const js = await hql.transpile(hqlCode);
  console.log("\n=== Transpiled JavaScript ===");
  console.log(js);
  
  console.log("\n=== Running HQL code ===");
  await hql.run(hqlCode);
} catch (error) {
  console.error("Error:", error);
}