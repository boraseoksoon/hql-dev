// .hql-cache/1/doc/examples/test-get.ts
console.log("=== Direct get test ===");
var arr = [100, 200, 300];
console.log("Array:", arr);
console.log("Direct get 0:", arr[0]);
console.log("Direct get 1:", arr[1]);
console.log("\\n=== Get inside function ===");
function test_get(coll) {
  console.log("In function, coll:", coll);
  console.log("In function, get 0:", coll[0]);
  return console.log("In function, get 1:", coll[1]);
}
test_get(arr);
console.log("\\n=== Get inside loop ===");
function test_loop(coll) {
  console.log("Starting loop with:", coll);
  return function() {
    function loop_16(i) {
      if (i < 3)
        return function() {
          console.log("  Loop i=", i, "get:", coll[i]);
          return (() => loop_16(i + 1))();
        }();
      else
        return null;
    }
    return loop_16(0);
  }();
}
test_loop(arr);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy90ZXN0LWdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc29sZS5sb2coXCI9PT0gRGlyZWN0IGdldCB0ZXN0ID09PVwiKTtcbmxldCBhcnIgPSBbMTAwLCAyMDAsIDMwMF07XG5jb25zb2xlLmxvZyhcIkFycmF5OlwiLCBhcnIpO1xuY29uc29sZS5sb2coXCJEaXJlY3QgZ2V0IDA6XCIsIGFyclswXSk7XG5jb25zb2xlLmxvZyhcIkRpcmVjdCBnZXQgMTpcIiwgYXJyWzFdKTtcbmNvbnNvbGUubG9nKFwiXFxcXG49PT0gR2V0IGluc2lkZSBmdW5jdGlvbiA9PT1cIik7XG5mdW5jdGlvbiB0ZXN0X2dldChjb2xsKSB7XG4gICAgY29uc29sZS5sb2coXCJJbiBmdW5jdGlvbiwgY29sbDpcIiwgY29sbCk7XG4gICAgY29uc29sZS5sb2coXCJJbiBmdW5jdGlvbiwgZ2V0IDA6XCIsIGNvbGxbMF0pO1xuICAgIHJldHVybiBjb25zb2xlLmxvZyhcIkluIGZ1bmN0aW9uLCBnZXQgMTpcIiwgY29sbFsxXSk7XG59XG50ZXN0X2dldChhcnIpO1xuY29uc29sZS5sb2coXCJcXFxcbj09PSBHZXQgaW5zaWRlIGxvb3AgPT09XCIpO1xuZnVuY3Rpb24gdGVzdF9sb29wKGNvbGwpIHtcbiAgICBjb25zb2xlLmxvZyhcIlN0YXJ0aW5nIGxvb3Agd2l0aDpcIiwgY29sbCk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZnVuY3Rpb24gbG9vcF8xNihpKSB7XG4gICAgICAgICAgICBpZiAoaSA8IDMpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCIgIExvb3AgaT1cIiwgaSwgXCJnZXQ6XCIsIGNvbGxbaV0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKCgpID0+IGxvb3BfMTYoaSArIDEpKSgpO1xuICAgICAgICAgICAgICAgIH0oKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbG9vcF8xNigwKTtcbiAgICB9KCk7XG59XG50ZXN0X2xvb3AoYXJyKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxRQUFRLElBQUkseUJBQXlCO0FBQ3JDLElBQUksTUFBTSxDQUFDLEtBQUssS0FBSyxHQUFHO0FBQ3hCLFFBQVEsSUFBSSxVQUFVLEdBQUc7QUFDekIsUUFBUSxJQUFJLGlCQUFpQixJQUFJLENBQUMsQ0FBQztBQUNuQyxRQUFRLElBQUksaUJBQWlCLElBQUksQ0FBQyxDQUFDO0FBQ25DLFFBQVEsSUFBSSxnQ0FBZ0M7QUFDNUMsU0FBUyxTQUFTLE1BQU07QUFDcEIsVUFBUSxJQUFJLHNCQUFzQixJQUFJO0FBQ3RDLFVBQVEsSUFBSSx1QkFBdUIsS0FBSyxDQUFDLENBQUM7QUFDMUMsU0FBTyxRQUFRLElBQUksdUJBQXVCLEtBQUssQ0FBQyxDQUFDO0FBQ3JEO0FBQ0EsU0FBUyxHQUFHO0FBQ1osUUFBUSxJQUFJLDRCQUE0QjtBQUN4QyxTQUFTLFVBQVUsTUFBTTtBQUNyQixVQUFRLElBQUksdUJBQXVCLElBQUk7QUFDdkMsU0FBTyxXQUFZO0FBQ2YsYUFBUyxRQUFRLEdBQUc7QUFDaEIsVUFBSSxJQUFJO0FBQ0osZUFBTyxXQUFZO0FBQ2Ysa0JBQVEsSUFBSSxhQUFhLEdBQUcsUUFBUSxLQUFLLENBQUMsQ0FBQztBQUMzQyxrQkFBUSxNQUFNLFFBQVEsSUFBSSxDQUFDLEdBQUc7QUFBQSxRQUNsQyxFQUFFO0FBQUE7QUFFRixlQUFPO0FBQUEsSUFDZjtBQUNBLFdBQU8sUUFBUSxDQUFDO0FBQUEsRUFDcEIsRUFBRTtBQUNOO0FBQ0EsVUFBVSxHQUFHOyIsCiAgIm5hbWVzIjogW10KfQo=
