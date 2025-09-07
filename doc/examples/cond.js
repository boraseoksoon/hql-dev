// .hql-cache/1/doc/examples/cond.ts
function classify_number(n) {
  return n > 100 ? "large" : n > 50 ? "medium" : n > 10 ? "small" : n > 0 ? "tiny" : n === 0 ? "zero" : "negative";
}
function check_value(val) {
  return val > 10 ? "greater" : val === 10 ? "equal" : "less";
}
function check_point(x, y) {
  return x < 0 ? y < 0 ? "third quadrant" : "second quadrant" : x > 0 ? y < 0 ? "fourth quadrant" : "first quadrant" : y === 0 ? "origin" : y > 0 ? "positive y-axis" : "negative y-axis";
}
function check_boolean(val) {
  return val ? "Value is true" : "Value is false";
}
function grade_score(score) {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}
console.log("=== Testing classify-number ===");
console.log("classify-number(150):", classify_number(150));
console.log("classify-number(100):", classify_number(100));
console.log("classify-number(75):", classify_number(75));
console.log("classify-number(50):", classify_number(50));
console.log("classify-number(25):", classify_number(25));
console.log("classify-number(10):", classify_number(10));
console.log("classify-number(5):", classify_number(5));
console.log("classify-number(0):", classify_number(0));
console.log("classify-number(-10):", classify_number(-10));
console.log("\\n=== Testing check-value ===");
console.log("check-value(20):", check_value(20));
console.log("check-value(10):", check_value(10));
console.log("check-value(5):", check_value(5));
console.log("\\n=== Testing check-point ===");
console.log("check-point(5, 5):", check_point(5, 5));
console.log("check-point(-5, 5):", check_point(-5, 5));
console.log("check-point(-5, -5):", check_point(-5, -5));
console.log("check-point(5, -5):", check_point(5, -5));
console.log("check-point(0, 0):", check_point(0, 0));
console.log("check-point(0, 5):", check_point(0, 5));
console.log("check-point(0, -5):", check_point(0, -5));
console.log("\\n=== Testing check-boolean ===");
console.log("check-boolean(true):", check_boolean(true));
console.log("check-boolean(false):", check_boolean(false));
console.log("\\n=== Testing grade-score ===");
console.log("grade-score(95):", grade_score(95));
console.log("grade-score(85):", grade_score(85));
console.log("grade-score(75):", grade_score(75));
console.log("grade-score(65):", grade_score(65));
console.log("grade-score(55):", grade_score(55));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9jb25kLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJmdW5jdGlvbiBjbGFzc2lmeV9udW1iZXIobikge1xuICAgIHJldHVybiBuID4gMTAwID8gXCJsYXJnZVwiIDogbiA+IDUwID8gXCJtZWRpdW1cIiA6IG4gPiAxMCA/IFwic21hbGxcIiA6IG4gPiAwID8gXCJ0aW55XCIgOiBuID09PSAwID8gXCJ6ZXJvXCIgOiBcIm5lZ2F0aXZlXCI7XG59XG5mdW5jdGlvbiBjaGVja192YWx1ZSh2YWwpIHtcbiAgICByZXR1cm4gdmFsID4gMTAgPyBcImdyZWF0ZXJcIiA6IHZhbCA9PT0gMTAgPyBcImVxdWFsXCIgOiBcImxlc3NcIjtcbn1cbmZ1bmN0aW9uIGNoZWNrX3BvaW50KHgsIHkpIHtcbiAgICByZXR1cm4geCA8IDAgPyB5IDwgMCA/IFwidGhpcmQgcXVhZHJhbnRcIiA6IFwic2Vjb25kIHF1YWRyYW50XCIgOiB4ID4gMCA/IHkgPCAwID8gXCJmb3VydGggcXVhZHJhbnRcIiA6IFwiZmlyc3QgcXVhZHJhbnRcIiA6IHkgPT09IDAgPyBcIm9yaWdpblwiIDogeSA+IDAgPyBcInBvc2l0aXZlIHktYXhpc1wiIDogXCJuZWdhdGl2ZSB5LWF4aXNcIjtcbn1cbmZ1bmN0aW9uIGNoZWNrX2Jvb2xlYW4odmFsKSB7XG4gICAgcmV0dXJuIHZhbCA/IFwiVmFsdWUgaXMgdHJ1ZVwiIDogXCJWYWx1ZSBpcyBmYWxzZVwiO1xufVxuZnVuY3Rpb24gZ3JhZGVfc2NvcmUoc2NvcmUpIHtcbiAgICByZXR1cm4gc2NvcmUgPj0gOTAgPyBcIkFcIiA6IHNjb3JlID49IDgwID8gXCJCXCIgOiBzY29yZSA+PSA3MCA/IFwiQ1wiIDogc2NvcmUgPj0gNjAgPyBcIkRcIiA6IFwiRlwiO1xufVxuY29uc29sZS5sb2coXCI9PT0gVGVzdGluZyBjbGFzc2lmeS1udW1iZXIgPT09XCIpO1xuY29uc29sZS5sb2coXCJjbGFzc2lmeS1udW1iZXIoMTUwKTpcIiwgY2xhc3NpZnlfbnVtYmVyKDE1MCkpO1xuY29uc29sZS5sb2coXCJjbGFzc2lmeS1udW1iZXIoMTAwKTpcIiwgY2xhc3NpZnlfbnVtYmVyKDEwMCkpO1xuY29uc29sZS5sb2coXCJjbGFzc2lmeS1udW1iZXIoNzUpOlwiLCBjbGFzc2lmeV9udW1iZXIoNzUpKTtcbmNvbnNvbGUubG9nKFwiY2xhc3NpZnktbnVtYmVyKDUwKTpcIiwgY2xhc3NpZnlfbnVtYmVyKDUwKSk7XG5jb25zb2xlLmxvZyhcImNsYXNzaWZ5LW51bWJlcigyNSk6XCIsIGNsYXNzaWZ5X251bWJlcigyNSkpO1xuY29uc29sZS5sb2coXCJjbGFzc2lmeS1udW1iZXIoMTApOlwiLCBjbGFzc2lmeV9udW1iZXIoMTApKTtcbmNvbnNvbGUubG9nKFwiY2xhc3NpZnktbnVtYmVyKDUpOlwiLCBjbGFzc2lmeV9udW1iZXIoNSkpO1xuY29uc29sZS5sb2coXCJjbGFzc2lmeS1udW1iZXIoMCk6XCIsIGNsYXNzaWZ5X251bWJlcigwKSk7XG5jb25zb2xlLmxvZyhcImNsYXNzaWZ5LW51bWJlcigtMTApOlwiLCBjbGFzc2lmeV9udW1iZXIoLTEwKSk7XG5jb25zb2xlLmxvZyhcIlxcXFxuPT09IFRlc3RpbmcgY2hlY2stdmFsdWUgPT09XCIpO1xuY29uc29sZS5sb2coXCJjaGVjay12YWx1ZSgyMCk6XCIsIGNoZWNrX3ZhbHVlKDIwKSk7XG5jb25zb2xlLmxvZyhcImNoZWNrLXZhbHVlKDEwKTpcIiwgY2hlY2tfdmFsdWUoMTApKTtcbmNvbnNvbGUubG9nKFwiY2hlY2stdmFsdWUoNSk6XCIsIGNoZWNrX3ZhbHVlKDUpKTtcbmNvbnNvbGUubG9nKFwiXFxcXG49PT0gVGVzdGluZyBjaGVjay1wb2ludCA9PT1cIik7XG5jb25zb2xlLmxvZyhcImNoZWNrLXBvaW50KDUsIDUpOlwiLCBjaGVja19wb2ludCg1LCA1KSk7XG5jb25zb2xlLmxvZyhcImNoZWNrLXBvaW50KC01LCA1KTpcIiwgY2hlY2tfcG9pbnQoLTUsIDUpKTtcbmNvbnNvbGUubG9nKFwiY2hlY2stcG9pbnQoLTUsIC01KTpcIiwgY2hlY2tfcG9pbnQoLTUsIC01KSk7XG5jb25zb2xlLmxvZyhcImNoZWNrLXBvaW50KDUsIC01KTpcIiwgY2hlY2tfcG9pbnQoNSwgLTUpKTtcbmNvbnNvbGUubG9nKFwiY2hlY2stcG9pbnQoMCwgMCk6XCIsIGNoZWNrX3BvaW50KDAsIDApKTtcbmNvbnNvbGUubG9nKFwiY2hlY2stcG9pbnQoMCwgNSk6XCIsIGNoZWNrX3BvaW50KDAsIDUpKTtcbmNvbnNvbGUubG9nKFwiY2hlY2stcG9pbnQoMCwgLTUpOlwiLCBjaGVja19wb2ludCgwLCAtNSkpO1xuY29uc29sZS5sb2coXCJcXFxcbj09PSBUZXN0aW5nIGNoZWNrLWJvb2xlYW4gPT09XCIpO1xuY29uc29sZS5sb2coXCJjaGVjay1ib29sZWFuKHRydWUpOlwiLCBjaGVja19ib29sZWFuKHRydWUpKTtcbmNvbnNvbGUubG9nKFwiY2hlY2stYm9vbGVhbihmYWxzZSk6XCIsIGNoZWNrX2Jvb2xlYW4oZmFsc2UpKTtcbmNvbnNvbGUubG9nKFwiXFxcXG49PT0gVGVzdGluZyBncmFkZS1zY29yZSA9PT1cIik7XG5jb25zb2xlLmxvZyhcImdyYWRlLXNjb3JlKDk1KTpcIiwgZ3JhZGVfc2NvcmUoOTUpKTtcbmNvbnNvbGUubG9nKFwiZ3JhZGUtc2NvcmUoODUpOlwiLCBncmFkZV9zY29yZSg4NSkpO1xuY29uc29sZS5sb2coXCJncmFkZS1zY29yZSg3NSk6XCIsIGdyYWRlX3Njb3JlKDc1KSk7XG5jb25zb2xlLmxvZyhcImdyYWRlLXNjb3JlKDY1KTpcIiwgZ3JhZGVfc2NvcmUoNjUpKTtcbmNvbnNvbGUubG9nKFwiZ3JhZGUtc2NvcmUoNTUpOlwiLCBncmFkZV9zY29yZSg1NSkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFBLFNBQVMsZ0JBQWdCLEdBQUc7QUFDeEIsU0FBTyxJQUFJLE1BQU0sVUFBVSxJQUFJLEtBQUssV0FBVyxJQUFJLEtBQUssVUFB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
