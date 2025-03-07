
// HQL Runtime Functions
function list(...args) {
  return args;
}
const or_test1 = (true ? true : false);
const or_test2 = (false ? false : "fallback");
const and_test1 = (true ? "result" : true);
const and_test2 = (false ? "never seen" : false);
const not_test1 = (true ? 0 : 1);
const not_test2 = (false ? 0 : 1);
const a = 10;
const b = 5;
const do_result = function() {
  const temp_a = 10;
  return (temp_a + a);
}();
const is_positive = function(n) {
  return >(n, 0);
};
const fn_test1 = is_positive(5);
const fn_test2 = is_positive(-3);
const range_test1 = check_range(15, 10, 20);
const range_test2 = check_range(5, 10, 20);
const export_all_tests = list(or_test1, or_test2, and_test1, and_test2, not_test1, not_test2, gt_test, lt_test, gte_test, lte_test, eq_test, do_result, cond_result1, cond_result2, fn_test1, fn_test2, complex1, complex2, range_test1, range_test2);
export { export_all_tests as all_tests };