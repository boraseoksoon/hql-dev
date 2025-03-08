
// HQL Runtime Functions
function list(...args) {
  return args;
}
const calculate = (function (x, y) {
    return (function () {
        const sum = x + y;
        return (function () {
            const diff = x - y;
            return list(sum, diff);
        })([]);
    })([]);
});
