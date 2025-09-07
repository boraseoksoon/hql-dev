// .hql-cache/1/doc/examples/fx.ts
console.log("============ fx test =============");
function stringify(...args) {
  let value = void 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["value"] !== void 0)
      value = args[0]["value"];
    if (value === void 0 && args.length > 0)
      value = args[0];
  } else {
    if (args.length > 0)
      value = args[0];
  }
  value = typeof value === "object" && value !== null ? JSON.parse(JSON.stringify(value)) : value;
  value = typeof value === "object" && value !== null ? JSON.parse(JSON.stringify(value)) : value;
  return JSON.stringify(value);
}
function add_ints(...args) {
  let a = 0;
  let b = 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["a"] !== void 0)
      a = args[0]["a"];
    if (args[0]["b"] !== void 0)
      b = args[0]["b"];
    if (a === void 0 && args.length > 0)
      a = args[0];
  } else {
    if (args.length > 0)
      a = args[0];
    if (args.length > 1)
      b = args[1];
  }
  a = typeof a === "object" && a !== null ? JSON.parse(JSON.stringify(a)) : a;
  b = typeof b === "object" && b !== null ? JSON.parse(JSON.stringify(b)) : b;
  a = typeof a === "object" && a !== null ? JSON.parse(JSON.stringify(a)) : a;
  b = typeof b === "object" && b !== null ? JSON.parse(JSON.stringify(b)) : b;
  return a + b;
}
function add_with_defaults(...args) {
  let a = 5;
  let b = 10;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["a"] !== void 0)
      a = args[0]["a"];
    if (args[0]["b"] !== void 0)
      b = args[0]["b"];
    if (a === 5 && args.length > 0)
      a = args[0];
  } else {
    if (args.length > 0)
      a = args[0];
    if (args.length > 1)
      b = args[1];
  }
  a = typeof a === "object" && a !== null ? JSON.parse(JSON.stringify(a)) : a;
  b = typeof b === "object" && b !== null ? JSON.parse(JSON.stringify(b)) : b;
  a = typeof a === "object" && a !== null ? JSON.parse(JSON.stringify(a)) : a;
  b = typeof b === "object" && b !== null ? JSON.parse(JSON.stringify(b)) : b;
  return a + b;
}
function multiply_doubles(...args) {
  let a = 0;
  let b = 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["a"] !== void 0)
      a = args[0]["a"];
    if (args[0]["b"] !== void 0)
      b = args[0]["b"];
    if (a === void 0 && args.length > 0)
      a = args[0];
  } else {
    if (args.length > 0)
      a = args[0];
    if (args.length > 1)
      b = args[1];
  }
  a = typeof a === "object" && a !== null ? JSON.parse(JSON.stringify(a)) : a;
  b = typeof b === "object" && b !== null ? JSON.parse(JSON.stringify(b)) : b;
  a = typeof a === "object" && a !== null ? JSON.parse(JSON.stringify(a)) : a;
  b = typeof b === "object" && b !== null ? JSON.parse(JSON.stringify(b)) : b;
  return a * b;
}
function concat_strings(...args) {
  let a = "";
  let b = "";
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["a"] !== void 0)
      a = args[0]["a"];
    if (args[0]["b"] !== void 0)
      b = args[0]["b"];
    if (a === void 0 && args.length > 0)
      a = args[0];
  } else {
    if (args.length > 0)
      a = args[0];
    if (args.length > 1)
      b = args[1];
  }
  a = typeof a === "object" && a !== null ? JSON.parse(JSON.stringify(a)) : a;
  b = typeof b === "object" && b !== null ? JSON.parse(JSON.stringify(b)) : b;
  a = typeof a === "object" && a !== null ? JSON.parse(JSON.stringify(a)) : a;
  b = typeof b === "object" && b !== null ? JSON.parse(JSON.stringify(b)) : b;
  return a + b;
}
function logical_and(...args) {
  let a = false;
  let b = false;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["a"] !== void 0)
      a = args[0]["a"];
    if (args[0]["b"] !== void 0)
      b = args[0]["b"];
    if (a === void 0 && args.length > 0)
      a = args[0];
  } else {
    if (args.length > 0)
      a = args[0];
    if (args.length > 1)
      b = args[1];
  }
  a = typeof a === "object" && a !== null ? JSON.parse(JSON.stringify(a)) : a;
  b = typeof b === "object" && b !== null ? JSON.parse(JSON.stringify(b)) : b;
  a = typeof a === "object" && a !== null ? JSON.parse(JSON.stringify(a)) : a;
  b = typeof b === "object" && b !== null ? JSON.parse(JSON.stringify(b)) : b;
  return a ? b ? true : false : false;
}
function calculate_distance(...args) {
  let x1 = 0;
  let y1 = 0;
  let x2 = 0;
  let y2 = 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["x1"] !== void 0)
      x1 = args[0]["x1"];
    if (args[0]["y1"] !== void 0)
      y1 = args[0]["y1"];
    if (args[0]["x2"] !== void 0)
      x2 = args[0]["x2"];
    if (args[0]["y2"] !== void 0)
      y2 = args[0]["y2"];
    if (x1 === void 0 && args.length > 0)
      x1 = args[0];
  } else {
    if (args.length > 0)
      x1 = args[0];
    if (args.length > 1)
      y1 = args[1];
    if (args.length > 2)
      x2 = args[2];
    if (args.length > 3)
      y2 = args[3];
  }
  x1 = typeof x1 === "object" && x1 !== null ? JSON.parse(JSON.stringify(x1)) : x1;
  y1 = typeof y1 === "object" && y1 !== null ? JSON.parse(JSON.stringify(y1)) : y1;
  x2 = typeof x2 === "object" && x2 !== null ? JSON.parse(JSON.stringify(x2)) : x2;
  y2 = typeof y2 === "object" && y2 !== null ? JSON.parse(JSON.stringify(y2)) : y2;
  x1 = typeof x1 === "object" && x1 !== null ? JSON.parse(JSON.stringify(x1)) : x1;
  y1 = typeof y1 === "object" && y1 !== null ? JSON.parse(JSON.stringify(y1)) : y1;
  x2 = typeof x2 === "object" && x2 !== null ? JSON.parse(JSON.stringify(x2)) : x2;
  y2 = typeof y2 === "object" && y2 !== null ? JSON.parse(JSON.stringify(y2)) : y2;
  return function() {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }();
}
function format_user(...args) {
  let name = "";
  let age = 0;
  let active = false;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["name"] !== void 0)
      name = args[0]["name"];
    if (args[0]["age"] !== void 0)
      age = args[0]["age"];
    if (args[0]["active"] !== void 0)
      active = args[0]["active"];
    if (name === void 0 && args.length > 0)
      name = args[0];
  } else {
    if (args.length > 0)
      name = args[0];
    if (args.length > 1)
      age = args[1];
    if (args.length > 2)
      active = args[2];
  }
  name = typeof name === "object" && name !== null ? JSON.parse(JSON.stringify(name)) : name;
  age = typeof age === "object" && age !== null ? JSON.parse(JSON.stringify(age)) : age;
  active = typeof active === "object" && active !== null ? JSON.parse(JSON.stringify(active)) : active;
  name = typeof name === "object" && name !== null ? JSON.parse(JSON.stringify(name)) : name;
  age = typeof age === "object" && age !== null ? JSON.parse(JSON.stringify(age)) : age;
  active = typeof active === "object" && active !== null ? JSON.parse(JSON.stringify(active)) : active;
  return function() {
    const status = active ? "active" : "inactive";
    return "User " + name + " is " + ("" + age) + " years old and " + status;
  }();
}
function convert_to_bool(...args) {
  let value = void 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["value"] !== void 0)
      value = args[0]["value"];
    if (value === void 0 && args.length > 0)
      value = args[0];
  } else {
    if (args.length > 0)
      value = args[0];
  }
  value = typeof value === "object" && value !== null ? JSON.parse(JSON.stringify(value)) : value;
  value = typeof value === "object" && value !== null ? JSON.parse(JSON.stringify(value)) : value;
  return value ? true : false;
}
function increment_counters(...args) {
  let obj = void 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["obj"] !== void 0)
      obj = args[0]["obj"];
    if (obj === void 0 && args.length > 0)
      obj = args[0];
  } else {
    if (args.length > 0)
      obj = args[0];
  }
  obj = typeof obj === "object" && obj !== null ? JSON.parse(JSON.stringify(obj)) : obj;
  obj = typeof obj === "object" && obj !== null ? JSON.parse(JSON.stringify(obj)) : obj;
  return obj === null ? (() => ({
    count: 1
  }))() : function() {
    const newObj = Object.assign(/* @__PURE__ */ Object.create({}), obj);
    const currentCount = Object.hasOwnProperty(obj, "count") ? obj.count : 0;
    newObj["count"] = currentCount + 1;
    return newObj;
  }();
}
function merge_objects(...args) {
  let obj1 = void 0;
  let obj2 = void 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["obj1"] !== void 0)
      obj1 = args[0]["obj1"];
    if (args[0]["obj2"] !== void 0)
      obj2 = args[0]["obj2"];
    if (obj1 === void 0 && args.length > 0)
      obj1 = args[0];
  } else {
    if (args.length > 0)
      obj1 = args[0];
    if (args.length > 1)
      obj2 = args[1];
  }
  obj1 = typeof obj1 === "object" && obj1 !== null ? JSON.parse(JSON.stringify(obj1)) : obj1;
  obj2 = typeof obj2 === "object" && obj2 !== null ? JSON.parse(JSON.stringify(obj2)) : obj2;
  obj1 = typeof obj1 === "object" && obj1 !== null ? JSON.parse(JSON.stringify(obj1)) : obj1;
  obj2 = typeof obj2 === "object" && obj2 !== null ? JSON.parse(JSON.stringify(obj2)) : obj2;
  return function() {
    const safe_obj1 = obj1 === null ? {} : obj1;
    const safe_obj2 = obj2 === null ? {} : obj2;
    return Object.assign(/* @__PURE__ */ Object.create({}), safe_obj1, safe_obj2);
  }();
}
(function() {
  const test1 = add_ints(5, 7);
  const test2 = add_with_defaults();
  const test3 = add_with_defaults(20);
  const test4 = add_with_defaults(3, 4);
  const test5 = multiply_doubles(2.5, 3);
  const test6 = concat_strings("Hello, ", "World!");
  const test7 = logical_and(true, false);
  const test8 = stringify({
    name: "John",
    age: 30
  });
  const test9 = calculate_distance(0, 0, 3, 4);
  const test10 = format_user("Alice", 25, true);
  const test11 = convert_to_bool(0);
  const test12 = increment_counters({
    count: 5
  });
  const test13 = increment_counters(null);
  const test14 = merge_objects({
    a: 1
  }, {
    b: 2
  });
  const test15 = merge_objects(null, {
    key: "value"
  });
  console.log("Test 1 (add-ints):", test1);
  console.log("Test 2 (add-with-defaults, no args):", test2);
  console.log("Test 3 (add-with-defaults, one arg):", test3);
  console.log("Test 4 (add-with-defaults, two args):", test4);
  console.log("Test 5 (multiply-doubles):", test5);
  console.log("Test 6 (concat-strings):", test6);
  console.log("Test 7 (logical-and):", test7);
  console.log("Test 8 (stringify):", test8);
  console.log("Test 9 (calculate-distance):", test9);
  console.log("Test 10 (format-user):", test10);
  console.log("Test 11 (convert-to-bool with 0):", test11);
  console.log("Test 12 (increment-counters):", test12);
  console.log("Test 13 (increment-counters with null):", test13);
  console.log("Test 14 (merge-objects):", test14);
  console.log("Test 15 (merge-objects with null):", test15);
  return console.log("Test 15 (merge-objects with null):", test15);
})();
var json = {
  name: "John",
  age: 30
};
function stringify2(...args) {
  let value = void 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["value"] !== void 0)
      value = args[0]["value"];
    if (value === void 0 && args.length > 0)
      value = args[0];
  } else {
    if (args.length > 0)
      value = args[0];
  }
  value = typeof value === "object" && value !== null ? JSON.parse(JSON.stringify(value)) : value;
  value = typeof value === "object" && value !== null ? JSON.parse(JSON.stringify(value)) : value;
  return JSON.stringify(value);
}
console.log(stringify2(json));
console.log(stringify2({
  name: "John",
  age: 30
}));
console.log(stringify2({
  name: "John",
  age: 30
}));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9meC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc29sZS5sb2coXCI9PT09PT09PT09PT0gZnggdGVzdCA9PT09PT09PT09PT09XCIpO1xuZnVuY3Rpb24gc3RyaW5naWZ5KC4uLmFyZ3MpIHtcbiAgICBsZXQgdmFsdWUgPSB1bmRlZmluZWQ7XG4gICAgaWYgKGFyZ3MubGVuZ3RoID09PSAxICYmIHR5cGVvZiBhcmdzWzBdID09PSBcIm9iamVjdFwiICYmIGFyZ3NbMF0gIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkoYXJnc1swXSkpIHtcbiAgICAgICAgaWYgKGFyZ3NbMF1bXCJ2YWx1ZVwiXSAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgdmFsdWUgPSBhcmdzWzBdW1widmFsdWVcIl07XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkICYmIGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHZhbHVlID0gYXJnc1swXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICB2YWx1ZSA9IGFyZ3NbMF07XG4gICAgfVxuICAgIHZhbHVlID0gdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHZhbHVlICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIDogdmFsdWU7XG4gICAgdmFsdWUgPSB0eXBlb2YodmFsdWUpID09PSBcIm9iamVjdFwiICYmIHZhbHVlICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh2YWx1ZSkpIDogdmFsdWU7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbn1cbmZ1bmN0aW9uIGFkZF9pbnRzKC4uLmFyZ3MpIHtcbiAgICBsZXQgYSA9IDA7XG4gICAgbGV0IGIgPSAwO1xuICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgYXJnc1swXSA9PT0gXCJvYmplY3RcIiAmJiBhcmdzWzBdICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KGFyZ3NbMF0pKSB7XG4gICAgICAgIGlmIChhcmdzWzBdW1wiYVwiXSAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgYSA9IGFyZ3NbMF1bXCJhXCJdO1xuICAgICAgICBpZiAoYXJnc1swXVtcImJcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGIgPSBhcmdzWzBdW1wiYlwiXTtcbiAgICAgICAgaWYgKGEgPT09IHVuZGVmaW5lZCAmJiBhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICBhID0gYXJnc1swXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICBhID0gYXJnc1swXTtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMSlcbiAgICAgICAgICAgIGIgPSBhcmdzWzFdO1xuICAgIH1cbiAgICBhID0gdHlwZW9mIGEgPT09IFwib2JqZWN0XCIgJiYgYSAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYSkpIDogYTtcbiAgICBiID0gdHlwZW9mIGIgPT09IFwib2JqZWN0XCIgJiYgYiAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYikpIDogYjtcbiAgICBhID0gdHlwZW9mKGEpID09PSBcIm9iamVjdFwiICYmIGEgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGEpKSA6IGE7XG4gICAgYiA9IHR5cGVvZihiKSA9PT0gXCJvYmplY3RcIiAmJiBiICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShiKSkgOiBiO1xuICAgIHJldHVybiBhICsgYjtcbn1cbmZ1bmN0aW9uIGFkZF93aXRoX2RlZmF1bHRzKC4uLmFyZ3MpIHtcbiAgICBsZXQgYSA9IDU7XG4gICAgbGV0IGIgPSAxMDtcbiAgICBpZiAoYXJncy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGFyZ3NbMF0gPT09IFwib2JqZWN0XCIgJiYgYXJnc1swXSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShhcmdzWzBdKSkge1xuICAgICAgICBpZiAoYXJnc1swXVtcImFcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGEgPSBhcmdzWzBdW1wiYVwiXTtcbiAgICAgICAgaWYgKGFyZ3NbMF1bXCJiXCJdICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBiID0gYXJnc1swXVtcImJcIl07XG4gICAgICAgIGlmIChhID09PSA1ICYmIGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIGEgPSBhcmdzWzBdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIGEgPSBhcmdzWzBdO1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAxKVxuICAgICAgICAgICAgYiA9IGFyZ3NbMV07XG4gICAgfVxuICAgIGEgPSB0eXBlb2YgYSA9PT0gXCJvYmplY3RcIiAmJiBhICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShhKSkgOiBhO1xuICAgIGIgPSB0eXBlb2YgYiA9PT0gXCJvYmplY3RcIiAmJiBiICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShiKSkgOiBiO1xuICAgIGEgPSB0eXBlb2YoYSkgPT09IFwib2JqZWN0XCIgJiYgYSAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYSkpIDogYTtcbiAgICBiID0gdHlwZW9mKGIpID09PSBcIm9iamVjdFwiICYmIGIgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGIpKSA6IGI7XG4gICAgcmV0dXJuIGEgKyBiO1xufVxuZnVuY3Rpb24gbXVsdGlwbHlfZG91YmxlcyguLi5hcmdzKSB7XG4gICAgbGV0IGEgPSAwO1xuICAgIGxldCBiID0gMDtcbiAgICBpZiAoYXJncy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGFyZ3NbMF0gPT09IFwib2JqZWN0XCIgJiYgYXJnc1swXSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShhcmdzWzBdKSkge1xuICAgICAgICBpZiAoYXJnc1swXVtcImFcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGEgPSBhcmdzWzBdW1wiYVwiXTtcbiAgICAgICAgaWYgKGFyZ3NbMF1bXCJiXCJdICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBiID0gYXJnc1swXVtcImJcIl07XG4gICAgICAgIGlmIChhID09PSB1bmRlZmluZWQgJiYgYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgYSA9IGFyZ3NbMF07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgYSA9IGFyZ3NbMF07XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDEpXG4gICAgICAgICAgICBiID0gYXJnc1sxXTtcbiAgICB9XG4gICAgYSA9IHR5cGVvZiBhID09PSBcIm9iamVjdFwiICYmIGEgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGEpKSA6IGE7XG4gICAgYiA9IHR5cGVvZiBiID09PSBcIm9iamVjdFwiICYmIGIgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGIpKSA6IGI7XG4gICAgYSA9IHR5cGVvZihhKSA9PT0gXCJvYmplY3RcIiAmJiBhICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShhKSkgOiBhO1xuICAgIGIgPSB0eXBlb2YoYikgPT09IFwib2JqZWN0XCIgJiYgYiAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYikpIDogYjtcbiAgICByZXR1cm4gYSAqIGI7XG59XG5mdW5jdGlvbiBjb25jYXRfc3RyaW5ncyguLi5hcmdzKSB7XG4gICAgbGV0IGEgPSBcIlwiO1xuICAgIGxldCBiID0gXCJcIjtcbiAgICBpZiAoYXJncy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGFyZ3NbMF0gPT09IFwib2JqZWN0XCIgJiYgYXJnc1swXSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShhcmdzWzBdKSkge1xuICAgICAgICBpZiAoYXJnc1swXVtcImFcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGEgPSBhcmdzWzBdW1wiYVwiXTtcbiAgICAgICAgaWYgKGFyZ3NbMF1bXCJiXCJdICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBiID0gYXJnc1swXVtcImJcIl07XG4gICAgICAgIGlmIChhID09PSB1bmRlZmluZWQgJiYgYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgYSA9IGFyZ3NbMF07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgYSA9IGFyZ3NbMF07XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDEpXG4gICAgICAgICAgICBiID0gYXJnc1sxXTtcbiAgICB9XG4gICAgYSA9IHR5cGVvZiBhID09PSBcIm9iamVjdFwiICYmIGEgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGEpKSA6IGE7XG4gICAgYiA9IHR5cGVvZiBiID09PSBcIm9iamVjdFwiICYmIGIgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGIpKSA6IGI7XG4gICAgYSA9IHR5cGVvZihhKSA9PT0gXCJvYmplY3RcIiAmJiBhICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShhKSkgOiBhO1xuICAgIGIgPSB0eXBlb2YoYikgPT09IFwib2JqZWN0XCIgJiYgYiAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYikpIDogYjtcbiAgICByZXR1cm4gYSArIGI7XG59XG5mdW5jdGlvbiBsb2dpY2FsX2FuZCguLi5hcmdzKSB7XG4gICAgbGV0IGEgPSBmYWxzZTtcbiAgICBsZXQgYiA9IGZhbHNlO1xuICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgYXJnc1swXSA9PT0gXCJvYmplY3RcIiAmJiBhcmdzWzBdICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KGFyZ3NbMF0pKSB7XG4gICAgICAgIGlmIChhcmdzWzBdW1wiYVwiXSAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgYSA9IGFyZ3NbMF1bXCJhXCJdO1xuICAgICAgICBpZiAoYXJnc1swXVtcImJcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGIgPSBhcmdzWzBdW1wiYlwiXTtcbiAgICAgICAgaWYgKGEgPT09IHVuZGVmaW5lZCAmJiBhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICBhID0gYXJnc1swXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICBhID0gYXJnc1swXTtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMSlcbiAgICAgICAgICAgIGIgPSBhcmdzWzFdO1xuICAgIH1cbiAgICBhID0gdHlwZW9mIGEgPT09IFwib2JqZWN0XCIgJiYgYSAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYSkpIDogYTtcbiAgICBiID0gdHlwZW9mIGIgPT09IFwib2JqZWN0XCIgJiYgYiAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYikpIDogYjtcbiAgICBhID0gdHlwZW9mKGEpID09PSBcIm9iamVjdFwiICYmIGEgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGEpKSA6IGE7XG4gICAgYiA9IHR5cGVvZihiKSA9PT0gXCJvYmplY3RcIiAmJiBiICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShiKSkgOiBiO1xuICAgIHJldHVybiBhID8gYiA/IHRydWUgOiBmYWxzZSA6IGZhbHNlO1xufVxuZnVuY3Rpb24gY2FsY3VsYXRlX2Rpc3RhbmNlKC4uLmFyZ3MpIHtcbiAgICBsZXQgeDEgPSAwO1xuICAgIGxldCB5MSA9IDA7XG4gICAgbGV0IHgyID0gMDtcbiAgICBsZXQgeTIgPSAwO1xuICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgYXJnc1swXSA9PT0gXCJvYmplY3RcIiAmJiBhcmdzWzBdICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KGFyZ3NbMF0pKSB7XG4gICAgICAgIGlmIChhcmdzWzBdW1wieDFcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIHgxID0gYXJnc1swXVtcIngxXCJdO1xuICAgICAgICBpZiAoYXJnc1swXVtcInkxXCJdICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICB5MSA9IGFyZ3NbMF1bXCJ5MVwiXTtcbiAgICAgICAgaWYgKGFyZ3NbMF1bXCJ4MlwiXSAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgeDIgPSBhcmdzWzBdW1wieDJcIl07XG4gICAgICAgIGlmIChhcmdzWzBdW1wieTJcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIHkyID0gYXJnc1swXVtcInkyXCJdO1xuICAgICAgICBpZiAoeDEgPT09IHVuZGVmaW5lZCAmJiBhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICB4MSA9IGFyZ3NbMF07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgeDEgPSBhcmdzWzBdO1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAxKVxuICAgICAgICAgICAgeTEgPSBhcmdzWzFdO1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAyKVxuICAgICAgICAgICAgeDIgPSBhcmdzWzJdO1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAzKVxuICAgICAgICAgICAgeTIgPSBhcmdzWzNdO1xuICAgIH1cbiAgICB4MSA9IHR5cGVvZiB4MSA9PT0gXCJvYmplY3RcIiAmJiB4MSAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoeDEpKSA6IHgxO1xuICAgIHkxID0gdHlwZW9mIHkxID09PSBcIm9iamVjdFwiICYmIHkxICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh5MSkpIDogeTE7XG4gICAgeDIgPSB0eXBlb2YgeDIgPT09IFwib2JqZWN0XCIgJiYgeDIgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHgyKSkgOiB4MjtcbiAgICB5MiA9IHR5cGVvZiB5MiA9PT0gXCJvYmplY3RcIiAmJiB5MiAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoeTIpKSA6IHkyO1xuICAgIHgxID0gdHlwZW9mKHgxKSA9PT0gXCJvYmplY3RcIiAmJiB4MSAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoeDEpKSA6IHgxO1xuICAgIHkxID0gdHlwZW9mKHkxKSA9PT0gXCJvYmplY3RcIiAmJiB5MSAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoeTEpKSA6IHkxO1xuICAgIHgyID0gdHlwZW9mKHgyKSA9PT0gXCJvYmplY3RcIiAmJiB4MiAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoeDIpKSA6IHgyO1xuICAgIHkyID0gdHlwZW9mKHkyKSA9PT0gXCJvYmplY3RcIiAmJiB5MiAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoeTIpKSA6IHkyO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNvbnN0IGR4ID0geDIgLSB4MTtcbiAgICAgICAgY29uc3QgZHkgPSB5MiAtIHkxO1xuICAgICAgICByZXR1cm4gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbiAgICB9KCk7XG59XG5mdW5jdGlvbiBmb3JtYXRfdXNlciguLi5hcmdzKSB7XG4gICAgbGV0IG5hbWUgPSBcIlwiO1xuICAgIGxldCBhZ2UgPSAwO1xuICAgIGxldCBhY3RpdmUgPSBmYWxzZTtcbiAgICBpZiAoYXJncy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGFyZ3NbMF0gPT09IFwib2JqZWN0XCIgJiYgYXJnc1swXSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShhcmdzWzBdKSkge1xuICAgICAgICBpZiAoYXJnc1swXVtcIm5hbWVcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIG5hbWUgPSBhcmdzWzBdW1wibmFtZVwiXTtcbiAgICAgICAgaWYgKGFyZ3NbMF1bXCJhZ2VcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGFnZSA9IGFyZ3NbMF1bXCJhZ2VcIl07XG4gICAgICAgIGlmIChhcmdzWzBdW1wiYWN0aXZlXCJdICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBhY3RpdmUgPSBhcmdzWzBdW1wiYWN0aXZlXCJdO1xuICAgICAgICBpZiAobmFtZSA9PT0gdW5kZWZpbmVkICYmIGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIG5hbWUgPSBhcmdzWzBdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIG5hbWUgPSBhcmdzWzBdO1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAxKVxuICAgICAgICAgICAgYWdlID0gYXJnc1sxXTtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMilcbiAgICAgICAgICAgIGFjdGl2ZSA9IGFyZ3NbMl07XG4gICAgfVxuICAgIG5hbWUgPSB0eXBlb2YgbmFtZSA9PT0gXCJvYmplY3RcIiAmJiBuYW1lICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShuYW1lKSkgOiBuYW1lO1xuICAgIGFnZSA9IHR5cGVvZiBhZ2UgPT09IFwib2JqZWN0XCIgJiYgYWdlICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShhZ2UpKSA6IGFnZTtcbiAgICBhY3RpdmUgPSB0eXBlb2YgYWN0aXZlID09PSBcIm9iamVjdFwiICYmIGFjdGl2ZSAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYWN0aXZlKSkgOiBhY3RpdmU7XG4gICAgbmFtZSA9IHR5cGVvZihuYW1lKSA9PT0gXCJvYmplY3RcIiAmJiBuYW1lICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShuYW1lKSkgOiBuYW1lO1xuICAgIGFnZSA9IHR5cGVvZihhZ2UpID09PSBcIm9iamVjdFwiICYmIGFnZSAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYWdlKSkgOiBhZ2U7XG4gICAgYWN0aXZlID0gdHlwZW9mKGFjdGl2ZSkgPT09IFwib2JqZWN0XCIgJiYgYWN0aXZlICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShhY3RpdmUpKSA6IGFjdGl2ZTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBzdGF0dXMgPSBhY3RpdmUgPyBcImFjdGl2ZVwiIDogXCJpbmFjdGl2ZVwiO1xuICAgICAgICByZXR1cm4gXCJVc2VyIFwiICsgbmFtZSArIFwiIGlzIFwiICsgKFwiXCIgKyBhZ2UpICsgXCIgeWVhcnMgb2xkIGFuZCBcIiArIHN0YXR1cztcbiAgICB9KCk7XG59XG5mdW5jdGlvbiBjb252ZXJ0X3RvX2Jvb2woLi4uYXJncykge1xuICAgIGxldCB2YWx1ZSA9IHVuZGVmaW5lZDtcbiAgICBpZiAoYXJncy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGFyZ3NbMF0gPT09IFwib2JqZWN0XCIgJiYgYXJnc1swXSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShhcmdzWzBdKSkge1xuICAgICAgICBpZiAoYXJnc1swXVtcInZhbHVlXCJdICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICB2YWx1ZSA9IGFyZ3NbMF1bXCJ2YWx1ZVwiXTtcbiAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgJiYgYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgdmFsdWUgPSBhcmdzWzBdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHZhbHVlID0gYXJnc1swXTtcbiAgICB9XG4gICAgdmFsdWUgPSB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgOiB2YWx1ZTtcbiAgICB2YWx1ZSA9IHR5cGVvZih2YWx1ZSkgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgOiB2YWx1ZTtcbiAgICByZXR1cm4gdmFsdWUgPyB0cnVlIDogZmFsc2U7XG59XG5mdW5jdGlvbiBpbmNyZW1lbnRfY291bnRlcnMoLi4uYXJncykge1xuICAgIGxldCBvYmogPSB1bmRlZmluZWQ7XG4gICAgaWYgKGFyZ3MubGVuZ3RoID09PSAxICYmIHR5cGVvZiBhcmdzWzBdID09PSBcIm9iamVjdFwiICYmIGFyZ3NbMF0gIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkoYXJnc1swXSkpIHtcbiAgICAgICAgaWYgKGFyZ3NbMF1bXCJvYmpcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIG9iaiA9IGFyZ3NbMF1bXCJvYmpcIl07XG4gICAgICAgIGlmIChvYmogPT09IHVuZGVmaW5lZCAmJiBhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICBvYmogPSBhcmdzWzBdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIG9iaiA9IGFyZ3NbMF07XG4gICAgfVxuICAgIG9iaiA9IHR5cGVvZiBvYmogPT09IFwib2JqZWN0XCIgJiYgb2JqICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvYmopKSA6IG9iajtcbiAgICBvYmogPSB0eXBlb2Yob2JqKSA9PT0gXCJvYmplY3RcIiAmJiBvYmogIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9iaikpIDogb2JqO1xuICAgIHJldHVybiBvYmogPT09IG51bGwgPyAoKCkgPT4gKHtcbiAgICAgICAgY291bnQ6IDFcbiAgICB9KSkoKSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY29uc3QgbmV3T2JqID0gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKHt9KSwgb2JqKTtcbiAgICAgICAgY29uc3QgY3VycmVudENvdW50ID0gT2JqZWN0Lmhhc093blByb3BlcnR5KG9iaiwgXCJjb3VudFwiKSA/IG9iai5jb3VudCA6IDA7XG4gICAgICAgIG5ld09ialtcImNvdW50XCJdID0gY3VycmVudENvdW50ICsgMTtcbiAgICAgICAgcmV0dXJuIG5ld09iajtcbiAgICB9KCk7XG59XG5mdW5jdGlvbiBtZXJnZV9vYmplY3RzKC4uLmFyZ3MpIHtcbiAgICBsZXQgb2JqMSA9IHVuZGVmaW5lZDtcbiAgICBsZXQgb2JqMiA9IHVuZGVmaW5lZDtcbiAgICBpZiAoYXJncy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGFyZ3NbMF0gPT09IFwib2JqZWN0XCIgJiYgYXJnc1swXSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShhcmdzWzBdKSkge1xuICAgICAgICBpZiAoYXJnc1swXVtcIm9iajFcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIG9iajEgPSBhcmdzWzBdW1wib2JqMVwiXTtcbiAgICAgICAgaWYgKGFyZ3NbMF1bXCJvYmoyXCJdICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBvYmoyID0gYXJnc1swXVtcIm9iajJcIl07XG4gICAgICAgIGlmIChvYmoxID09PSB1bmRlZmluZWQgJiYgYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgb2JqMSA9IGFyZ3NbMF07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgb2JqMSA9IGFyZ3NbMF07XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDEpXG4gICAgICAgICAgICBvYmoyID0gYXJnc1sxXTtcbiAgICB9XG4gICAgb2JqMSA9IHR5cGVvZiBvYmoxID09PSBcIm9iamVjdFwiICYmIG9iajEgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9iajEpKSA6IG9iajE7XG4gICAgb2JqMiA9IHR5cGVvZiBvYmoyID09PSBcIm9iamVjdFwiICYmIG9iajIgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9iajIpKSA6IG9iajI7XG4gICAgb2JqMSA9IHR5cGVvZihvYmoxKSA9PT0gXCJvYmplY3RcIiAmJiBvYmoxICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvYmoxKSkgOiBvYmoxO1xuICAgIG9iajIgPSB0eXBlb2Yob2JqMikgPT09IFwib2JqZWN0XCIgJiYgb2JqMiAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob2JqMikpIDogb2JqMjtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBzYWZlX29iajEgPSBvYmoxID09PSBudWxsID8ge30gOiBvYmoxO1xuICAgICAgICBjb25zdCBzYWZlX29iajIgPSBvYmoyID09PSBudWxsID8ge30gOiBvYmoyO1xuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKHt9KSwgc2FmZV9vYmoxLCBzYWZlX29iajIpO1xuICAgIH0oKTtcbn1cbihmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgdGVzdDEgPSBhZGRfaW50cyg1LCA3KTtcbiAgICBjb25zdCB0ZXN0MiA9IGFkZF93aXRoX2RlZmF1bHRzKCk7XG4gICAgY29uc3QgdGVzdDMgPSBhZGRfd2l0aF9kZWZhdWx0cygyMCk7XG4gICAgY29uc3QgdGVzdDQgPSBhZGRfd2l0aF9kZWZhdWx0cygzLCA0KTtcbiAgICBjb25zdCB0ZXN0NSA9IG11bHRpcGx5X2RvdWJsZXMoMi41LCAzKTtcbiAgICBjb25zdCB0ZXN0NiA9IGNvbmNhdF9zdHJpbmdzKFwiSGVsbG8sIFwiLCBcIldvcmxkIVwiKTtcbiAgICBjb25zdCB0ZXN0NyA9IGxvZ2ljYWxfYW5kKHRydWUsIGZhbHNlKTtcbiAgICBjb25zdCB0ZXN0OCA9IHN0cmluZ2lmeSh7XG4gICAgICAgIG5hbWU6IFwiSm9oblwiLFxuICAgICAgICBhZ2U6IDMwXG4gICAgfSk7XG4gICAgY29uc3QgdGVzdDkgPSBjYWxjdWxhdGVfZGlzdGFuY2UoMCwgMCwgMywgNCk7XG4gICAgY29uc3QgdGVzdDEwID0gZm9ybWF0X3VzZXIoXCJBbGljZVwiLCAyNSwgdHJ1ZSk7XG4gICAgY29uc3QgdGVzdDExID0gY29udmVydF90b19ib29sKDApO1xuICAgIGNvbnN0IHRlc3QxMiA9IGluY3JlbWVudF9jb3VudGVycyh7XG4gICAgICAgIGNvdW50OiA1XG4gICAgfSk7XG4gICAgY29uc3QgdGVzdDEzID0gaW5jcmVtZW50X2NvdW50ZXJzKG51bGwpO1xuICAgIGNvbnN0IHRlc3QxNCA9IG1lcmdlX29iamVjdHMoe1xuICAgICAgICBhOiAxXG4gICAgfSwge1xuICAgICAgICBiOiAyXG4gICAgfSk7XG4gICAgY29uc3QgdGVzdDE1ID0gbWVyZ2Vfb2JqZWN0cyhudWxsLCB7XG4gICAgICAgIGtleTogXCJ2YWx1ZVwiXG4gICAgfSk7XG4gICAgY29uc29sZS5sb2coXCJUZXN0IDEgKGFkZC1pbnRzKTpcIiwgdGVzdDEpO1xuICAgIGNvbnNvbGUubG9nKFwiVGVzdCAyIChhZGQtd2l0aC1kZWZhdWx0cywgbm8gYXJncyk6XCIsIHRlc3QyKTtcbiAgICBjb25zb2xlLmxvZyhcIlRlc3QgMyAoYWRkLXdpdGgtZGVmYXVsdHMsIG9uZSBhcmcpOlwiLCB0ZXN0Myk7XG4gICAgY29uc29sZS5sb2coXCJUZXN0IDQgKGFkZC13aXRoLWRlZmF1bHRzLCB0d28gYXJncyk6XCIsIHRlc3Q0KTtcbiAgICBjb25zb2xlLmxvZyhcIlRlc3QgNSAobXVsdGlwbHktZG91Ymxlcyk6XCIsIHRlc3Q1KTtcbiAgICBjb25zb2xlLmxvZyhcIlRlc3QgNiAoY29uY2F0LXN0cmluZ3MpOlwiLCB0ZXN0Nik7XG4gICAgY29uc29sZS5sb2coXCJUZXN0IDcgKGxvZ2ljYWwtYW5kKTpcIiwgdGVzdDcpO1xuICAgIGNvbnNvbGUubG9nKFwiVGVzdCA4IChzdHJpbmdpZnkpOlwiLCB0ZXN0OCk7XG4gICAgY29uc29sZS5sb2coXCJUZXN0IDkgKGNhbGN1bGF0ZS1kaXN0YW5jZSk6XCIsIHRlc3Q5KTtcbiAgICBjb25zb2xlLmxvZyhcIlRlc3QgMTAgKGZvcm1hdC11c2VyKTpcIiwgdGVzdDEwKTtcbiAgICBjb25zb2xlLmxvZyhcIlRlc3QgMTEgKGNvbnZlcnQtdG8tYm9vbCB3aXRoIDApOlwiLCB0ZXN0MTEpO1xuICAgIGNvbnNvbGUubG9nKFwiVGVzdCAxMiAoaW5jcmVtZW50LWNvdW50ZXJzKTpcIiwgdGVzdDEyKTtcbiAgICBjb25zb2xlLmxvZyhcIlRlc3QgMTMgKGluY3JlbWVudC1jb3VudGVycyB3aXRoIG51bGwpOlwiLCB0ZXN0MTMpO1xuICAgIGNvbnNvbGUubG9nKFwiVGVzdCAxNCAobWVyZ2Utb2JqZWN0cyk6XCIsIHRlc3QxNCk7XG4gICAgY29uc29sZS5sb2coXCJUZXN0IDE1IChtZXJnZS1vYmplY3RzIHdpdGggbnVsbCk6XCIsIHRlc3QxNSk7XG4gICAgcmV0dXJuIGNvbnNvbGUubG9nKFwiVGVzdCAxNSAobWVyZ2Utb2JqZWN0cyB3aXRoIG51bGwpOlwiLCB0ZXN0MTUpO1xufSkoKTtcbmNvbnN0IGpzb24gPSB7XG4gICAgbmFtZTogXCJKb2huXCIsXG4gICAgYWdlOiAzMFxufTtcbmZ1bmN0aW9uIHN0cmluZ2lmeTIoLi4uYXJncykge1xuICAgIGxldCB2YWx1ZSA9IHVuZGVmaW5lZDtcbiAgICBpZiAoYXJncy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGFyZ3NbMF0gPT09IFwib2JqZWN0XCIgJiYgYXJnc1swXSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShhcmdzWzBdKSkge1xuICAgICAgICBpZiAoYXJnc1swXVtcInZhbHVlXCJdICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICB2YWx1ZSA9IGFyZ3NbMF1bXCJ2YWx1ZVwiXTtcbiAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgJiYgYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgdmFsdWUgPSBhcmdzWzBdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHZhbHVlID0gYXJnc1swXTtcbiAgICB9XG4gICAgdmFsdWUgPSB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgOiB2YWx1ZTtcbiAgICB2YWx1ZSA9IHR5cGVvZih2YWx1ZSkgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHZhbHVlKSkgOiB2YWx1ZTtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xufVxuY29uc29sZS5sb2coc3RyaW5naWZ5Mihqc29uKSk7XG5jb25zb2xlLmxvZyhzdHJpbmdpZnkyKHtcbiAgICBuYW1lOiBcIkpvaG5cIixcbiAgICBhZ2U6IDMwXG59KSk7XG5jb25zb2xlLmxvZyhzdHJpbmdpZnkyKHtcbiAgICBuYW1lOiBcIkpvaG5cIixcbiAgICBhZ2U6IDMwXG59KSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsUUFBUSxJQUFJLG9DQUFvQztBQUNoRCxTQUFTLGFBQWEsTUFBTTtBQUN4QixNQUFJLFFBQVE7QUFDWixNQUFJLEtBQUssV0FBVyxLQUFLLE9BQU8sS0FBSyxDQUFDLE1BQU0sWUFBWSxLQUFLLENBQUMsTUFBTSxRQUFRLENBQUMsTUFBTSxRQUFRLEtBQUssQ0FBQyxDQUFDLEdBQUc7QUFDakcsUUFBSSxLQUFLLENBQUMsRUFBRSxPQUFPLE1BQU07QUFDckIsY0FBUSxLQUFLLENBQUMsRUFBRSxPQUFPO0FBQzNC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
