// examples/sample.js
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (typeof obj === "function") {
    try {
      return obj(key);
    } catch (e) {
      return key in obj ? obj[key] : notFound;
    }
  }
  if (Array.isArray(obj)) {
    return typeof key === "number" && key >= 0 && key < obj.length ? obj[key] : notFound;
  }
  if (obj instanceof Set) {
    return obj.has(key) ? key : notFound;
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
var classify_number = function(x) {
  return x < 0 ? "negative" : x === 0 ? "zero" : true ? "positive" : null;
};
var describe_number = function(x) {
  return x < 0 ? "negative" : x === 0 ? "zero" : x < 10 ? "small positive" : x < 100 ? "medium positive" : x < 1e3 ? "large positive" : true ? "very large positive" : null;
};
var complex_classification = function(x, y) {
  return x < 0 ? y < 0 ? "both negative" : y === 0 ? "x negative, y zero" : true ? "x negative, y positive" : null : x === 0 ? y < 0 ? "x zero, y negative" : y === 0 ? "both zero" : true ? "x zero, y positive" : null : true ? y < 0 ? "x positive, y negative" : y === 0 ? "x positive, y zero" : true ? "both positive" : null : null;
};
var complex_condition = function(x) {
  return (x > 0 ? x < 10 : x > 0) ? "between 0 and 10" : (x >= 10 ? x < 20 : x >= 10) ? "between 10 and 20" : (x === 0 ? x === 0 : x === 100) ? "special value" : true ? "other value" : null;
};
var expression_condition = function(x) {
  return function() {
    const doubled = x * 2;
    return doubled < 0 ? "doubled is negative" : doubled > 100 ? "doubled is large" : true ? "doubled is moderate" : null;
  }([]);
};
var compute_with_cond = function(x) {
  return x < 0 ? 0 - x : x === 0 ? 1 : true ? x * 2 : null;
};
console.log("---- Test 1: Basic classification ----");
console.log(get(classify_number, -5));
console.log(get(classify_number, 0));
console.log(get(classify_number, 10));
console.log("---- Test 2: Multiple clauses ----");
console.log(get(describe_number, -5));
console.log(get(describe_number, 0));
console.log(get(describe_number, 5));
console.log(get(describe_number, 50));
console.log(get(describe_number, 500));
console.log(get(describe_number, 5e3));
console.log("---- Test 3: Nested cond ----");
console.log(complex_classification(-5, -3));
console.log(complex_classification(-5, 0));
console.log(complex_classification(0, 5));
console.log(complex_classification(5, 5));
console.log("---- Test 4: Complex conditions ----");
console.log(get(complex_condition, 5));
console.log(get(complex_condition, 15));
console.log(get(complex_condition, 100));
console.log(get(complex_condition, 50));
console.log("---- Test 5: Expression conditions ----");
console.log(get(expression_condition, -10));
console.log(get(expression_condition, 60));
console.log(get(expression_condition, 30));
console.log("---- Test 6: Computed values ----");
console.log(get(compute_with_cond, -5));
console.log(get(compute_with_cond, 0));
console.log(get(compute_with_cond, 10));
