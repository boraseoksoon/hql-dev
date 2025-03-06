function calculateArea(_params0) {
  {
  const width = _params0.width;
  const height = _params0.height;
  return (width * height);
}
}
console.log(calculateArea({ "width": 5, "height": 10 }))
function add(_params0) {
  {
  const x = _params0.x;
  const y = _params0.y;
  return (x + y);
}
}
console.log("Sum of 3 and 4 (defn): ", add({ "x": 10, "y": 20 }))
function processData(_params0) {
  {
  const data = _params0.data;
  const options = _params0.options;
  return (data * options.factor);
}
}
console.log("Processed data (fx): ", processData({ "data": 100, "options": {factor: 1.5} }))
