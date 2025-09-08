// .hql-cache/1/doc/examples/function-call-detection-test.ts
function add5(x) {
  return x + 5;
}
function doSomethingFn(x) {
  return x + 10;
}
function getElementAtIndex(arr, index, fallback) {
  return index < Array.isArray(arr) ? arr[index] : fallback;
}
var myArray = ["a", "b", "c"];
var myObj = {
  x: 1,
  y: 2,
  z: 3
};
function xyz(n) {
  return n * 2;
}
function applyTwice(f, x) {
  return f(f(x));
}
function add10(x) {
  return x + 10;
}
console.log("===== Basic Function Tests =====");
console.log("add5(10):", add5(10));
console.log("doSomethingFn(5):", doSomethingFn(5));
console.log("getElementAtIndex(myArray, 1, 'not found'):", getElementAtIndex(myArray, 1, "not found"));
console.log("===== Collection Access Tests =====");
console.log("get(myArray, 0):", myArray[0]);
console.log("get(myObj, 'x'):", myObj["x"]);
console.log("===== Edge Case Tests =====");
console.log("xyz(5):", xyz(5));
console.log("applyTwice(add5, 10):", applyTwice(add5, 10));
console.log("add10(5):", add10(5));
function sumThree(a, b, c) {
  return a + (b + c);
}
console.log("sumThree(1, 2, 3):", sumThree(1, 2, 3));
var collectionTest = ["alpha", "beta", "gamma"];
console.log("Access element safely:");
console.log("getElementAtIndex(collectionTest, 1, 'fallback'):", getElementAtIndex(collectionTest, 1, "fallback"));
console.log("getElementAtIndex(collectionTest, 5, 'fallback'):", getElementAtIndex(collectionTest, 5, "fallback"));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9mdW5jdGlvbi1jYWxsLWRldGVjdGlvbi10ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJmdW5jdGlvbiBhZGQ1KHgpIHtcbiAgICByZXR1cm4geCArIDU7XG59XG5mdW5jdGlvbiBkb1NvbWV0aGluZ0ZuKHgpIHtcbiAgICByZXR1cm4geCArIDEwO1xufVxuZnVuY3Rpb24gZ2V0RWxlbWVudEF0SW5kZXgoYXJyLCBpbmRleCwgZmFsbGJhY2spIHtcbiAgICByZXR1cm4gaW5kZXggPCBBcnJheS5pc0FycmF5KGFycikgPyBhcnJbaW5kZXhdIDogZmFsbGJhY2s7XG59XG5sZXQgbXlBcnJheSA9IFtcImFcIiwgXCJiXCIsIFwiY1wiXTtcbmxldCBteU9iaiA9IHtcbiAgICB4OiAxLFxuICAgIHk6IDIsXG4gICAgejogM1xufTtcbmZ1bmN0aW9uIHh5eihuKSB7XG4gICAgcmV0dXJuIG4gKiAyO1xufVxuZnVuY3Rpb24gYXBwbHlUd2ljZShmLCB4KSB7XG4gICAgcmV0dXJuIGYoZih4KSk7XG59XG5mdW5jdGlvbiBhZGQxMCh4KSB7XG4gICAgcmV0dXJuIHggKyAxMDtcbn1cbmNvbnNvbGUubG9nKFwiPT09PT0gQmFzaWMgRnVuY3Rpb24gVGVzdHMgPT09PT1cIik7XG5jb25zb2xlLmxvZyhcImFkZDUoMTApOlwiLCBhZGQ1KDEwKSk7XG5jb25zb2xlLmxvZyhcImRvU29tZXRoaW5nRm4oNSk6XCIsIGRvU29tZXRoaW5nRm4oNSkpO1xuY29uc29sZS5sb2coXCJnZXRFbGVtZW50QXRJbmRleChteUFycmF5LCAxLCAnbm90IGZvdW5kJyk6XCIsIGdldEVsZW1lbnRBdEluZGV4KG15QXJyYXksIDEsIFwibm90IGZvdW5kXCIpKTtcbmNvbnNvbGUubG9nKFwiPT09PT0gQ29sbGVjdGlvbiBBY2Nlc3MgVGVzdHMgPT09PT1cIik7XG5jb25zb2xlLmxvZyhcImdldChteUFycmF5LCAwKTpcIiwgbXlBcnJheVswXSk7XG5jb25zb2xlLmxvZyhcImdldChteU9iaiwgJ3gnKTpcIiwgbXlPYmpbXCJ4XCJdKTtcbmNvbnNvbGUubG9nKFwiPT09PT0gRWRnZSBDYXNlIFRlc3RzID09PT09XCIpO1xuY29uc29sZS5sb2coXCJ4eXooNSk6XCIsIHh5eig1KSk7XG5jb25zb2xlLmxvZyhcImFwcGx5VHdpY2UoYWRkNSwgMTApOlwiLCBhcHBseVR3aWNlKGFkZDUsIDEwKSk7XG5jb25zb2xlLmxvZyhcImFkZDEwKDUpOlwiLCBhZGQxMCg1KSk7XG5mdW5jdGlvbiBzdW1UaHJlZShhLCBiLCBjKSB7XG4gICAgcmV0dXJuIGEgKyAoYiArIGMpO1xufVxuY29uc29sZS5sb2coXCJzdW1UaHJlZSgxLCAyLCAzKTpcIiwgc3VtVGhyZWUoMSwgMiwgMykpO1xubGV0IGNvbGxlY3Rpb25UZXN0ID0gW1wiYWxwaGFcIiwgXCJiZXRhXCIsIFwiZ2FtbWFcIl07XG5jb25zb2xlLmxvZyhcIkFjY2VzcyBlbGVtZW50IHNhZmVseTpcIik7XG5jb25zb2xlLmxvZyhcImdldEVsZW1lbnRBdEluZGV4KGNvbGxlY3Rpb25UZXN0LCAxLCAnZmFsbGJhY2snKTpcIiwgZ2V0RWxlbWVudEF0SW5kZXgoY29sbGVjdGlvblRlc3QsIDEsIFwiZmFsbGJhY2tcIikpO1xuY29uc29sZS5sb2coXCJnZXRFbGVtZW50QXRJbmRleChjb2xsZWN0aW9uVGVzdCwgNSwgJ2ZhbGxiYWNrJyk6XCIsIGdldEVsZW1lbnRBdEluZGV4KGNvbGxlY3Rpb25UZXN0LCA1LCBcImZhbGxiYWNrXCIpKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxTQUFTLEtBQUssR0FBRztBQUNiLFNBQU8sSUFBSTtBQUNmO0FBQ0EsU0FBUyxjQUFjLEdBQUc7QUFDdEIsU0FBTyxJQUFJO0FBQ2Y7QUFDQSxTQUFTLGtCQUFrQixLQUFLLE9BQU8sVUFBVTtBQUM3QyxTQUFPLFFBQVEsTUFBTSxRQUFRLEdBQUcsSUFBSSxJQUFJLEtBQUssSUFBSTtBQUNyRDtBQUNBLElBQUksVUFBVSxDQUFDLEtBQUssS0FBSyxHQUFHO0FBQzVCLElBQUksUUFBUTtBQUFBLEVBQ1IsR0FBRztBQUFBLEVBQ0gsR0FBRztBQUFBLEVBQ0gsR0FBRztBQUNQO0FBQ0EsU0FBUyxJQUFJLEdBQUc7QUFDWixTQUFPLElBQUk7QUFDZjtBQUNBLFNBQVMsV0FBVyxHQUFHLEdBQUc7QUFDdEIsU0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQ2pCO0FBQ0EsU0FBUyxNQUFNLEdBQUc7QUFDZCxTQUFPLElBQUk7QUFDZjtBQUNBLFFBQVEsSUFBSSxrQ0FBa0M7QUFDOUMsUUFBUSxJQUFJLGFBQWEsS0FBSyxFQUFFLENBQUM7QUFDakMsUUFBUSxJQUFJLHFCQUFxQixjQUFjLENBQUMsQ0FBQztBQUNqRCxRQUFRLElBQUksK0NBQStDLGtCQUFrQixTQUFTLEdBQUcsV0FBVyxDQUFDO0FBQ3JHLFFBQVEsSUFBSSxxQ0FBcUM7QUFDakQsUUFBUSxJQUFJLG9CQUFvQixRQUFRLENBQUMsQ0FBQztBQUMxQyxRQUFRLElBQUksb0JBQW9CLE1BQU0sR0FBRyxDQUFDO0FBQzFDLFFBQVEsSUFBSSw2QkFBNkI7QUFDekMsUUFBUSxJQUFJLFdBQVcsSUFBSSxDQUFDLENBQUM7QUFDN0IsUUFBUSxJQUFJLHlCQUF5QixXQUFXLE1BQU0sRUFBRSxDQUFDO0FBQ3pELFFBQVEsSUFBSSxhQUFhLE1BQU0sQ0FBQyxDQUFDO0FBQ2pDLFNBQVMsU0FBUyxHQUFHLEdBQUcsR0FBRztBQUN2QixTQUFPLEtBQUssSUFBSTtBQUNwQjtBQUNBLFFBQVEsSUFBSSxzQkFBc0IsU0FBUyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQ25ELElBQUksaUJBQWlCLENBQUMsU0FBUyxRQUFRLE9BQU87QUFDOUMsUUFBUSxJQUFJLHdCQUF3QjtBQUNwQyxRQUFRLElBQUkscURBQXFELGtCQUFrQixnQkFBZ0IsR0FBRyxVQUFVLENBQUM7QUFDakgsUUFBUSxJQUFJLHFEQUFxRCxrQkFBa0IsZ0JBQWdCLEdBQUcsVUFBVSxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
