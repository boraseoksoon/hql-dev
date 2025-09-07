import { _take, _map, _filter, _reduce, _range, _rangeGenerator, _groupBy, _keys } from "file:///Users/seoksoonjang/Desktop/hql/core/lib/stdlib/js/stdlib.js";
function take(n, coll) {
    return _take(n, coll);
}
function map(f, coll) {
    return _map(f, coll);
}
function filter(pred, coll) {
    return _filter(pred, coll);
}
function reduce(f, init, coll) {
    return _reduce(f, init, coll);
}
function range(...args) {
    return (args === null ? 0 : args.length) === 0 ? _rangeGenerator(0, Infinity, 1) : (args === null ? 0 : args.length) === 1 ? _rangeGenerator(0, args[0], 1) : (args === null ? 0 : args.length) === 2 ? _rangeGenerator(args[0], ((args === null ? false : true) ? (args === null ? 0 : args.length) > 1 : args === null ? false : true) ? args[1] : null, 1) : true ? _rangeGenerator(args[0], ((args === null ? false : true) ? (args === null ? 0 : args.length) > 1 : args === null ? false : true) ? args[1] : null, args[2]) : null;
}
function groupBy(f, coll) {
    return _groupBy(f, coll);
}
function keys(obj) {
    return _keys(obj);
}
export { take };
export { map, filter, reduce, range, groupBy, keys };
