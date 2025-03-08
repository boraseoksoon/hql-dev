
// HQL Runtime Functions
function list(...args) {
  return args;
}
const pi_value = function () {
    const _obj = Math;
    const _member = _obj["PI"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
};
console.log(pi_value);
console.log(pi_value());
const random_number = Math.random();
const text = "hello world";
const upper_text = text.toUpperCase();
console.log(upper_text);
const numbers = new(Array);
numbers.push(1);
numbers.push(2);
numbers.push(3);
console.log(numbers);
const date = new(Date);
const current_year = date.getFullYear();
export { pi_value as pi };
export { random_number as random };
export { upper_text as upperText };
export { numbers };
export { current_year as year };
