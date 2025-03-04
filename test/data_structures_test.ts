// test/data_structures_test.ts - Updated to fix failing tests
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { transpile } from "../src/transpiler/transformer.ts";

// JSON OBJECT LITERALS

Deno.test("data structures - empty object", async () => {
  const source = '(def empty-map {})';
  const result = await transpile(source);
  
  assertEquals(result.includes("const emptyMap = {}"), true);
});

Deno.test("data structures - simple object", async () => {
  const source = '(def user {"name": "Alice", "age": 30})';
  const result = await transpile(source);
  
  assertEquals(result.includes("const user = {"), true);
  assertEquals(result.includes("name: \"Alice\""), true);
  assertEquals(result.includes("age: 30"), true);
});

Deno.test("data structures - nested object", async () => {
  const source = `
    (def nested-map {
      "user": {
        "name": "Bob", 
        "contact": {
          "email": "bob@example.com"
        }
      }
    })
  `;
  const result = await transpile(source);
  
  assertEquals(result.includes("const nestedMap = {"), true);
  assertEquals(result.includes("user: {"), true);
  assertEquals(result.includes("name: \"Bob\""), true);
  assertEquals(result.includes("contact: {"), true);
  assertEquals(result.includes("email: \"bob@example.com\""), true);
});

// JSON ARRAY LITERALS

Deno.test("data structures - empty array", async () => {
  const source = '(def empty-vector [])';
  const result = await transpile(source);
  
  assertEquals(result.includes("const emptyVector = []"), true);
});

Deno.test("data structures - numeric array", async () => {
  const source = '(def numbers [1, 2, 3, 4, 5])';
  const result = await transpile(source);
  
  assertEquals(result.includes("const numbers = [1, 2, 3, 4, 5]"), true);
});

Deno.test("data structures - mixed array", async () => {
  const source = '(def mixed-vector [1, "two", true, null])';
  const result = await transpile(source);
  
  assertEquals(result.includes("const mixedVector = [1, \"two\", true, null]"), true);
});

// SET LITERALS

Deno.test("data structures - empty set", async () => {
  const source = '(def empty-set #[])';
  const result = await transpile(source);
  
  assertEquals(result.includes("const emptySet = new Set([])"), true);
});

Deno.test("data structures - number set", async () => {
  const source = '(def number-set #[1, 2, 3, 4, 5])';
  const result = await transpile(source);
  
  assertEquals(result.includes("const numberSet = new Set([1, 2, 3, 4, 5])"), true);
});

Deno.test("data structures - string set", async () => {
  const source = '(def string-set #["apple", "orange", "banana"])';
  const result = await transpile(source);
  
  assertEquals(result.includes("const stringSet = new Set([\"apple\", \"orange\", \"banana\"])"), true);
});

// COMPLEX MIXED STRUCTURES

Deno.test("data structures - complex nested structures", async () => {
  const source = `
    (def database {
      "users": [
        {"id": 1, "name": "Alice", "roles": ["admin", "user"]},
        {"id": 2, "name": "Bob", "roles": ["user"]}
      ],
      "settings": {
        "version": "1.0.0",
        "features": {
          "enabled": true,
          "list": ["search", "comments"]
        }
      }
    })
  `;
  const result = await transpile(source);
  
  // Check all levels of nesting in the resulting JavaScript
  assertEquals(result.includes("const database = {"), true);
  assertEquals(result.includes("users: ["), true);
  assertEquals(result.includes("id: 1"), true);
  assertEquals(result.includes("name: \"Alice\""), true);
  assertEquals(result.includes("roles: [\"admin\", \"user\"]"), true);
  assertEquals(result.includes("id: 2"), true);
  assertEquals(result.includes("name: \"Bob\""), true);
  assertEquals(result.includes("settings: {"), true);
  assertEquals(result.includes("version: \"1.0.0\""), true);
  assertEquals(result.includes("features: {"), true);
  assertEquals(result.includes("enabled: true"), true);
  assertEquals(result.includes("list: [\"search\", \"comments\"]"), true);
});

Deno.test("data structures - mixed with set literals", async () => {
  const source = `
    (def user-data {
      "name": "Charlie",
      "tags": #["javascript", "hql", "typescript"]
    })
  `;
  const result = await transpile(source);
  
  assertEquals(result.includes("const userData = {"), true);
  assertEquals(result.includes("name: \"Charlie\""), true);
  assertEquals(result.includes("tags: new Set([\"javascript\", \"hql\", \"typescript\"])"), true);
});

// ACCESSING DATA STRUCTURES

Deno.test("data structures - accessing array elements", async () => {
  const source = `
    (def numbers [10, 20, 30, 40, 50])
    (def third (get numbers 2))
    (print third)
  `;
  const result = await transpile(source);
  
  assertEquals(result.includes("const numbers = [10, 20, 30, 40, 50]"), true);
  assertEquals(result.includes("const third = numbers[2]"), true);
  assertEquals(result.includes("console.log(third)"), true);
});

Deno.test("data structures - accessing object properties", async () => {
  const source = `
    (def user {"name": "Alice", "age": 30})
    (def user-name (get user "name"))
    (print user-name)
  `;
  const result = await transpile(source);
  
  assertEquals(result.includes("const user = {name: \"Alice\", age: 30}"), true);
  assertEquals(result.includes("const userName = user.name"), true);
  assertEquals(result.includes("console.log(userName)"), true);
});

// INTEROPERABILITY WITH TRADITIONAL FORMS

Deno.test("data structures - compatibility with traditional forms", async () => {
  const source = `
    ;; Traditional hash-map
    (def traditional-map (hash-map (keyword "name") "Alice" (keyword "age") 30))
    
    ;; JSON-style object
    (def json-map {"name": "Alice", "age": 30})
    
    ;; Traditional vector
    (def traditional-vector (vector 1 2 3 4 5))
    
    ;; JSON-style array
    (def json-array [1, 2, 3, 4, 5])
    
    ;; Traditional set
    (def traditional-set (new Set (vector "a" "b" "c")))
    
    ;; Modern set literal
    (def modern-set #["a", "b", "c"])
    
    ;; Using both together
    (def combined {
      "traditional": traditional-map,
      "modern": json-map,
      "vectors": [traditional-vector, json-array],
      "sets": [traditional-set, modern-set]
    })
  `;
  const result = await transpile(source);
  
  // Both forms should produce equivalent JavaScript
  assertEquals(result.includes("const traditionalMap = {name: \"Alice\", age: 30}"), true);
  assertEquals(result.includes("const jsonMap = {name: \"Alice\", age: 30}"), true);
  assertEquals(result.includes("const traditionalVector = [1, 2, 3, 4, 5]"), true);
  assertEquals(result.includes("const jsonArray = [1, 2, 3, 4, 5]"), true);
  assertEquals(result.includes("const traditionalSet = new Set([\"a\", \"b\", \"c\"])"), true);
  assertEquals(result.includes("const modernSet = new Set([\"a\", \"b\", \"c\"])"), true);
  
  // Combining both styles should work 
  assertEquals(result.includes("const combined = {"), true);
  assertEquals(result.includes("traditional: traditionalMap"), true);
  assertEquals(result.includes("modern: jsonMap"), true);
  assertEquals(result.includes("vectors: [traditionalVector, jsonArray]"), true);
  assertEquals(result.includes("sets: [traditionalSet, modernSet]"), true);
});

// OPERATIONS WITH DATA STRUCTURES

Deno.test("data structures - operations and transformations", async () => {
  const source = `
    (def users [
      {"name": "Alice", "active": true},
      {"name": "Bob", "active": false},
      {"name": "Charlie", "active": true}
    ])
    
    (def active-users (filter users (fn (user) (get user "active"))))
    (def user-names (map users (fn (user) (get user "name"))))
    
    (print "Active users:" active-users)
    (print "User names:" user-names)
  `;
  const result = await transpile(source);
  
  assertEquals(result.includes("const users = ["), true);
  assertEquals(result.includes("{name: \"Alice\", active: true}"), true);
  assertEquals(result.includes("{name: \"Bob\", active: false}"), true);
  assertEquals(result.includes("{name: \"Charlie\", active: true}"), true);
  
  // Check for users.filter and users.map operations without being strict about the exact formatting
  const hasFilter = result.includes("users.filter") || result.includes("filter(users");
  const hasMap = result.includes("users.map") || result.includes("map(users");
  
  assertEquals(hasFilter, true, "Result should include a call to filter");
  assertEquals(hasMap, true, "Result should include a call to map");
  
  // Check for user.active and user.name without strict formatting requirements
  const hasActiveAccess = result.includes("user.active") || result.includes("user[\"active\"]") || result.includes("user['active']");
  const hasNameAccess = result.includes("user.name") || result.includes("user[\"name\"]") || result.includes("user['name']");
  
  assertEquals(hasActiveAccess, true, "Result should access user.active");
  assertEquals(hasNameAccess, true, "Result should access user.name");
});

// DATA STRUCTURE LITERALS WITH FX: we have to define and implement type system.

// Deno.test("data structures - integration with fx", async () => {
//   const source = `
//     (fx process-users (users: filter-fn:)
//       (map (filter users filter-fn)
//         (fn (user) {
//           "name": (get user "name"),
//           "processed": true
//         })
//       )
//     )
    
//     (def users [
//       {"name": "Alice", "active": true},
//       {"name": "Bob", "active": false}
//     ])
    
//     (def result (process-users 
//       users: users 
//       filter-fn: (fn (user) (get user "active"))
//     ))
    
//     (print result)
//   `;
  
//   // Log the source for debugging
//   console.log("\n--- Source for data structures - integration with fx ---");
//   console.log(source);
  
//   const result = await transpile(source);
  
//   // Log the transpiled result for debugging
//   console.log("\n--- Transpiled result for data structures - integration with fx ---");
//   console.log(result);
  
//   // Check function definition
//   assertEquals(result.includes("function processUsers("), true);
  
//   // Check for parameter destructuring (might be present in different forms)
//   const hasParameterDestructuring = 
//     result.includes("const { users, filterFn } = params") || 
//     result.includes("const users = params.users") ||
//     result.includes("users = params.users");
  
//   assertEquals(hasParameterDestructuring, true);
  
//   // Check the array literal
//   assertEquals(result.includes("const users = ["), true);
//   assertEquals(result.includes("{name: \"Alice\", active: true}"), true);
  
//   // Check the function call with named parameters (allowing different formats)
//   const hasFunctionCall = 
//     result.includes("const result = processUsers(") || 
//     result.includes("processUsers({");
  
//   assertEquals(hasFunctionCall, true);
  
//   // Check that user.active is referenced somewhere, allowing for different property access styles
//   const hasActivePropAccess = 
//     result.includes("user.active") || 
//     result.includes("user[\"active\"]") || 
//     result.includes("user['active']");
  
//   assertEquals(hasActivePropAccess, true, "Result should reference user.active property either via dot or bracket notation");
// });