
;; Function to flatten a matrix (2D array)
(fn flatten-matrix (matrix: [Array<Int>]) (-> [Int]) [1,2,3,4,5])

/*
seoksoonjang@seoksoons-MacBook-Pro hql % deno run -A ./cli/run.ts ./examples/bug11.hql
❌ Error during processing: _ is not defined: _ is not defined
seoksoonjang@seoksoons-MacBook-Pro hql % deno run -A ./cli/run.ts ./examples/bug11.hql --print
// ../../../../var/folders/sx/68vz7m857jngsy2_8w_djflw0000gn/T/hql_run_da9b34a6d15d15f5/bug11.run.ts
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (typeof obj !== "object" && typeof obj !== "function") {
    obj = Object(obj);
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
var OS = Object.freeze({
  macOS: "macOS",
  iOS: "iOS",
  linux: "linux"
});
function install(os) {
  return (() => {
    const _obj = _;
    const _method = get(_obj, "macOS");
    return typeof _method === "function" ? _method.call(_obj) : _method;
  })() ? console.log("Installing on macOS") : (() => {
    const _obj = _;
    const _method = get(_obj, "iOS");
    return typeof _method === "function" ? _method.call(_obj) : _method;
  })() ? console.log("Installing on iOS") : (() => {
    const _obj = _;
    const _method = get(_obj, "linux");
    return typeof _method === "function" ? _method.call(_obj) : _method;
  })() ? console.log("Installing on Linux") : console.log("Unsupported OS");
}
install(OS.macOS);
install(OS.iOS);
install(OS.linux);

seoksoonjang@seoksoons-MacBook-Pro hql % 
*/

;; looop in fx error
(fx generate-numbers (count: Int) (-> [Int])
  (let (result [])
    (loop (i 0 result result)
      (if (>= i count)
        result
        (recur (+ i 1) (.concat result [i]))))))

(print (generate-numbers 10))
/*
seoksoonjang@seoksoons-MacBook-Pro hql % deno run -A ./cli/run.ts ./examples/bug11.hql
❌ Error transforming node #1: Failed to transform fx function: Pure function 'generate-numbers' cannot reference external variable 'loop'
⚠️ Transformed 1 nodes successfully, but 1 nodes failed
❌ Error 1/1: Failed to transform fx function: Pure function 'generate-numbers' cannot reference external variable 'loop'
❌ Error during processing: generate_numbers is not defined: generate_numbers is not defined
seoksoonjang@seoksoons-MacBook-Pro hql % 
*/


;; undefined value
(fn generate-numbers (count: Int) (-> [Int])
  (let (result [])
    (loop (i 0 result result)
      (if (>= i count)
        result
        (recur (+ i 1) (.concat result [i]))))))

(print (generate-numbers 10))
;; undefiend

/*
seoksoonjang@seoksoons-MacBook-Pro hql % deno run -A ./cli/run.ts ./examples/bug11.hql --print
// ../../../../var/folders/sx/68vz7m857jngsy2_8w_djflw0000gn/T/hql_run_195b1c0cbfb39d5f/bug11.run.ts
function generate_numbers(count) {
  return function() {
    const result = [];
    (function() {
      function loop_0(i, result2) {
        if (i >= count)
          result2;
        else
          return loop_0(i + 1, result2.concat([i]));
      }
      return loop_0(0, result);
    })();
    return function() {
      function loop_0(i, result2) {
        if (i >= count)
          result2;
        else
          return loop_0(i + 1, result2.concat([i]));
      }
      return loop_0(0, result);
    }();
  }();
}
console.log(generate_numbers(10));

seoksoonjang@seoksoons-MacBook-Pro hql %
*/