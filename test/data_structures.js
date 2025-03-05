function reduce(coll, f, init) {
  return Array.prototype.reduce.call(coll, f, init);
}
function map(f, coll) {
  return Array.prototype.map.call(coll, f);
}
function filter(pred, coll) {
  return Array.prototype.filter.call(coll, pred);
}
const log = console.log;
const emptyVector = [];
const numbers = [1, 2, 3, 4, 5];
const mixedVector = [1, "two", true, null];
const emptyMap = {};
const userMap = {name: "Alice", age: 30, active: true};
const nestedMap = {user: {name: "Bob", contact: {email: "bob@example.com"}}};
const emptySet = new Set([]);
const numberSet = new Set([1, 2, 3, 4, 5]);
const stringSet = new Set(["apple", "orange", "banana"]);
const database = {users: [{id: 1, name: "Alice", roles: ["admin", "user"]}, {id: 2, name: "Bob", roles: ["user"]}], settings: {version: "1.0.0", features: {enabled: true, list: ["search", "comments"]}}};
const user1Tags = new Set(["javascript", "hql"]);
const user2Tags = new Set(["python", "rust"]);
console.log("Empty vector:", emptyVector)
console.log("Numbers vector:", numbers)
console.log("Mixed vector:", mixedVector)
console.log("Empty map:", emptyMap)
console.log("User map:", userMap)
console.log("Nested map:", nestedMap)
console.log("Empty set:", emptySet)
console.log("Number set:", numberSet)
console.log("String set:", stringSet)
console.log("Database:", database)
console.log("User 1 tags:", user1Tags)
console.log("User 2 tags:", user2Tags)
function greetUser(name, title) {
  return `Hello, ${title} ${name}!`;
}
function hello(arr, set) {
  return `array : ${arr} and set${set}!`;
}
console.log(hello([1, 2, 3, 4, 5], new Set([1, 2, 3])))
console.log(greetUser("Smith", "Dr."))
const getFromVector = numbers[2];
console.log("Element at index 2 of numbers:", getFromVector)
const getFromMap = userMap.name;
console.log("Value of 'name' from user-map:", getFromMap)
function processUser(userId, options) {
  {
  const users = database.users;
  const userIndex = (userId - 1);
  const user = users[userIndex];
  return (user === null) ? {error: "User not found"} : {user: {name: user.name, roles: user.roles, options: options}};
}
}
console.log("User data:", processUser(1, {detailed: true, includeInactive: false}))
console.log("Test complete")
