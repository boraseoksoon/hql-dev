// .hql-cache/1/doc/examples/data-structure.ts
var person = {
  name: "John",
  age: 30,
  hobbies: ["coding", "reading", "hiking"],
  "0": "zero-index-property"
};
function get_hobby(key) {
  return "Finding hobby: " + key;
}
get_hobby.version = "1.0";
get_hobby.author = "HQL Team";
console.log("\\n=== CASE 1: String property access ===");
console.log('(person "name") -> ', person["name"]);
console.log("(person.name) -> ", person.name);
console.log('(get person "name") -> ', person["name"]);
console.log("\\n=== CASE 2: Non-existent string property ===");
console.log('(person "address") -> ', person["address"]);
console.log("\\n=== CASE 3: String property access on a function ===");
console.log('(get-hobby "version") -> ', get_hobby("version"));
console.log("\\n=== CASE 4: Function call with string argument ===");
console.log('(get-hobby "hiking") -> ', get_hobby("hiking"));
var fruits = ["apple", "banana", "cherry", "date", "elderberry"];
function multiply_by_two(n) {
  return n * 2;
}
multiply_by_two._0 = "zero-property";
console.log("\\n=== CASE 5: Numeric array indexing ===");
console.log("(fruits 2) -> ", (() => {
  try {
    const result = fruits[2];
    return result !== void 0 ? result : fruits(2);
  } catch (_) {
    return fruits(2);
  }
})());
console.log("(get fruits 2) -> ", fruits[2]);
console.log("\\n=== CASE 6: Non-existent numeric property on array ===");
console.log("(fruits 10) [expected: undefined or error] -> ");
10 < fruits.length ? console.log((() => {
  try {
    const result = fruits[10];
    return result !== void 0 ? result : fruits(10);
  } catch (_) {
    return fruits(10);
  }
})()) : console.log("(Index out of bounds as expected)");
console.log("\\n=== CASE 7: Numeric property access on object ===");
console.log("(person 0) -> ", (() => {
  try {
    const result = person[0];
    return result !== void 0 ? result : person(0);
  } catch (_) {
    return person(0);
  }
})());
console.log("\\n=== CASE 8: Numeric property access on a function ===");
console.log("(multiply-by-two 0) -> ", multiply_by_two(0));
console.log("\\n=== CASE 9: Function call with numeric argument ===");
console.log("(multiply-by-two 5) -> ", multiply_by_two(5));
console.log("\\n=== CASE 10: Lambda with array indexing pattern ===");
var entries = Object.entries(person);
console.log("Original entries: ", entries);
var filtered = entries.filter(function(entry) {
  return (() => {
    try {
      const result = entry[0];
      return result !== void 0 ? result : entry(0);
    } catch (_) {
      return entry(0);
    }
  })() !== "age";
});
console.log("Filtered entries (excluding 'age'): ", filtered);
console.log("\\n=== CASE 11: Lambda with function call pattern ===");
var numbers = [1, 2, 3, 4, 5];
var doubled = numbers.map(function(n) {
  return multiply_by_two(n);
});
console.log("Doubled numbers: ", doubled);
console.log("\\nAll tests completed successfully!");
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9kYXRhLXN0cnVjdHVyZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsibGV0IHBlcnNvbiA9IHtcbiAgICBuYW1lOiBcIkpvaG5cIixcbiAgICBhZ2U6IDMwLFxuICAgIGhvYmJpZXM6IFtcImNvZGluZ1wiLCBcInJlYWRpbmdcIiwgXCJoaWtpbmdcIl0sXG4gICAgXCIwXCI6IFwiemVyby1pbmRleC1wcm9wZXJ0eVwiXG59O1xuZnVuY3Rpb24gZ2V0X2hvYmJ5KGtleSkge1xuICAgIHJldHVybiBcIkZpbmRpbmcgaG9iYnk6IFwiICsga2V5O1xufVxuZ2V0X2hvYmJ5LnZlcnNpb24gPSBcIjEuMFwiO1xuZ2V0X2hvYmJ5LmF1dGhvciA9IFwiSFFMIFRlYW1cIjtcbmNvbnNvbGUubG9nKFwiXFxcXG49PT0gQ0FTRSAxOiBTdHJpbmcgcHJvcGVydHkgYWNjZXNzID09PVwiKTtcbmNvbnNvbGUubG9nKFwiKHBlcnNvbiBcXFwibmFtZVxcXCIpIC0+IFwiLCBwZXJzb25bXCJuYW1lXCJdKTtcbmNvbnNvbGUubG9nKFwiKHBlcnNvbi5uYW1lKSAtPiBcIiwgcGVyc29uLm5hbWUpO1xuY29uc29sZS5sb2coXCIoZ2V0IHBlcnNvbiBcXFwibmFtZVxcXCIpIC0+IFwiLCBwZXJzb25bXCJuYW1lXCJdKTtcbmNvbnNvbGUubG9nKFwiXFxcXG49PT0gQ0FTRSAyOiBOb24tZXhpc3RlbnQgc3RyaW5nIHByb3BlcnR5ID09PVwiKTtcbmNvbnNvbGUubG9nKFwiKHBlcnNvbiBcXFwiYWRkcmVzc1xcXCIpIC0+IFwiLCBwZXJzb25bXCJhZGRyZXNzXCJdKTtcbmNvbnNvbGUubG9nKFwiXFxcXG49PT0gQ0FTRSAzOiBTdHJpbmcgcHJvcGVydHkgYWNjZXNzIG9uIGEgZnVuY3Rpb24gPT09XCIpO1xuY29uc29sZS5sb2coXCIoZ2V0LWhvYmJ5IFxcXCJ2ZXJzaW9uXFxcIikgLT4gXCIsIGdldF9ob2JieShcInZlcnNpb25cIikpO1xuY29uc29sZS5sb2coXCJcXFxcbj09PSBDQVNFIDQ6IEZ1bmN0aW9uIGNhbGwgd2l0aCBzdHJpbmcgYXJndW1lbnQgPT09XCIpO1xuY29uc29sZS5sb2coXCIoZ2V0LWhvYmJ5IFxcXCJoaWtpbmdcXFwiKSAtPiBcIiwgZ2V0X2hvYmJ5KFwiaGlraW5nXCIpKTtcbmxldCBmcnVpdHMgPSBbXCJhcHBsZVwiLCBcImJhbmFuYVwiLCBcImNoZXJyeVwiLCBcImRhdGVcIiwgXCJlbGRlcmJlcnJ5XCJdO1xuZnVuY3Rpb24gbXVsdGlwbHlfYnlfdHdvKG4pIHtcbiAgICByZXR1cm4gbiAqIDI7XG59XG5tdWx0aXBseV9ieV90d28uXzAgPSBcInplcm8tcHJvcGVydHlcIjtcbmNvbnNvbGUubG9nKFwiXFxcXG49PT0gQ0FTRSA1OiBOdW1lcmljIGFycmF5IGluZGV4aW5nID09PVwiKTtcbmNvbnNvbGUubG9nKFwiKGZydWl0cyAyKSAtPiBcIiwgKCgpID0+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBmcnVpdHNbMl07XG4gICAgICAgIHJldHVybiByZXN1bHQgIT09IHVuZGVmaW5lZCA/IHJlc3VsdCA6IGZydWl0cygyKTtcbiAgICB9XG4gICAgY2F0Y2ggKF8pIHtcbiAgICAgICAgcmV0dXJuIGZydWl0cygyKTtcbiAgICB9XG59KSgpKTtcbmNvbnNvbGUubG9nKFwiKGdldCBmcnVpdHMgMikgLT4gXCIsIGZydWl0c1syXSk7XG5jb25zb2xlLmxvZyhcIlxcXFxuPT09IENBU0UgNjogTm9uLWV4aXN0ZW50IG51bWVyaWMgcHJvcGVydHkgb24gYXJyYXkgPT09XCIpO1xuY29uc29sZS5sb2coXCIoZnJ1aXRzIDEwKSBbZXhwZWN0ZWQ6IHVuZGVmaW5lZCBvciBlcnJvcl0gLT4gXCIpO1xuMTAgPCBmcnVpdHMubGVuZ3RoID8gY29uc29sZS5sb2coKCgpID0+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBmcnVpdHNbMTBdO1xuICAgICAgICByZXR1cm4gcmVzdWx0ICE9PSB1bmRlZmluZWQgPyByZXN1bHQgOiBmcnVpdHMoMTApO1xuICAgIH1cbiAgICBjYXRjaCAoXykge1xuICAgICAgICByZXR1cm4gZnJ1aXRzKDEwKTtcbiAgICB9XG59KSgpKSA6IGNvbnNvbGUubG9nKFwiKEluZGV4IG91dCBvZiBib3VuZHMgYXMgZXhwZWN0ZWQpXCIpO1xuY29uc29sZS5sb2coXCJcXFxcbj09PSBDQVNFIDc6IE51bWVyaWMgcHJvcGVydHkgYWNjZXNzIG9uIG9iamVjdCA9PT1cIik7XG5jb25zb2xlLmxvZyhcIihwZXJzb24gMCkgLT4gXCIsICgoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gcGVyc29uWzBdO1xuICAgICAgICByZXR1cm4gcmVzdWx0ICE9PSB1bmRlZmluZWQgPyByZXN1bHQgOiBwZXJzb24oMCk7XG4gICAgfVxuICAgIGNhdGNoIChfKSB7XG4gICAgICAgIHJldHVybiBwZXJzb24oMCk7XG4gICAgfVxufSkoKSk7XG5jb25zb2xlLmxvZyhcIlxcXFxuPT09IENBU0UgODogTnVtZXJpYyBwcm9wZXJ0eSBhY2Nlc3Mgb24gYSBmdW5jdGlvbiA9PT1cIik7XG5jb25zb2xlLmxvZyhcIihtdWx0aXBseS1ieS10d28gMCkgLT4gXCIsIG11bHRpcGx5X2J5X3R3bygwKSk7XG5jb25zb2xlLmxvZyhcIlxcXFxuPT09IENBU0UgOTogRnVuY3Rpb24gY2FsbCB3aXRoIG51bWVyaWMgYXJndW1lbnQgPT09XCIpO1xuY29uc29sZS5sb2coXCIobXVsdGlwbHktYnktdHdvIDUpIC0+IFwiLCBtdWx0aXBseV9ieV90d28oNSkpO1xuY29uc29sZS5sb2coXCJcXFxcbj09PSBDQVNFIDEwOiBMYW1iZGEgd2l0aCBhcnJheSBpbmRleGluZyBwYXR0ZXJuID09PVwiKTtcbmxldCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXMocGVyc29uKTtcbmNvbnNvbGUubG9nKFwiT3JpZ2luYWwgZW50cmllczogXCIsIGVudHJpZXMpO1xubGV0IGZpbHRlcmVkID0gZW50cmllcy5maWx0ZXIoZnVuY3Rpb24gKGVudHJ5KSB7XG4gICAgcmV0dXJuICgoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBlbnRyeVswXTtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQgIT09IHVuZGVmaW5lZCA/IHJlc3VsdCA6IGVudHJ5KDApO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChfKSB7XG4gICAgICAgICAgICByZXR1cm4gZW50cnkoMCk7XG4gICAgICAgIH1cbiAgICB9KSgpICE9PSBcImFnZVwiO1xufSk7XG5jb25zb2xlLmxvZyhcIkZpbHRlcmVkIGVudHJpZXMgKGV4Y2x1ZGluZyAnYWdlJyk6IFwiLCBmaWx0ZXJlZCk7XG5jb25zb2xlLmxvZyhcIlxcXFxuPT09IENBU0UgMTE6IExhbWJkYSB3aXRoIGZ1bmN0aW9uIGNhbGwgcGF0dGVybiA9PT1cIik7XG5sZXQgbnVtYmVycyA9IFsxLCAyLCAzLCA0LCA1XTtcbmxldCBkb3VibGVkID0gbnVtYmVycy5tYXAoZnVuY3Rpb24gKG4pIHtcbiAgICByZXR1cm4gbXVsdGlwbHlfYnlfdHdvKG4pO1xufSk7XG5jb25zb2xlLmxvZyhcIkRvdWJsZWQgbnVtYmVyczogXCIsIGRvdWJsZWQpO1xuY29uc29sZS5sb2coXCJcXFxcbkFsbCB0ZXN0cyBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5IVwiKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxJQUFJLFNBQVM7QUFBQSxFQUNULE1BQU07QUFBQSxFQUNOLEtBQUs7QUFBQSxFQUNMLFNBQVMsQ0FBQyxVQUFVLFdBQVcsUUFBUTtBQUFBLEVBQ3ZDLEtBQUs7QUFDVDtBQUNBLFNBQVMsVUFBVSxLQUFLO0FBQ3BCLFNBQU8sb0JBQW9CO0FBQy9CO0FBQ0EsVUFBVSxVQUFVO0FBQ3BCLFVBQVUsU0FBUztBQUNuQixRQUFRLElBQUksMkNBQTJDO0FBQ3ZELFFBQVEsSUFBSSx1QkFBeUIsT0FBTyxNQUFN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
