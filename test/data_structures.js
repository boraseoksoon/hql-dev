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
function greetUser(params) {
  const { name, title } = params;
  return `Hello, ${title} ${name}!`;
}
console.log(greetUser({name: "Smith", title: "Dr."}))
const getFromVector = numbers[2];
console.log("Element at index 2 of numbers:", getFromVector)
const getFromMap = userMap.name;
console.log("Value of 'name' from user-map:", getFromMap)
function processUser(params) {
  const { userId, options } = params;
  {
  const users = database.users;
  const userIndex = (userId - 1);
  const user = users[userIndex];
  return (user === null) ? {error: "User not found"} : {user: {name: user.name, roles: user.roles, options: options}};
}
}
console.log("User data:", processUser({userId: 1, options: {detailed: true, includeInactive: false}}))
console.log("Test complete")
