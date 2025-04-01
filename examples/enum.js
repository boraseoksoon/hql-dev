// examples/enum.ts
var OsType = Object.freeze({
  macOS: "macOS",
  windowOS: "windowOS",
  linux: "linux"
});
var StatusCodes = Object.freeze(
  /* @type {Object<string, Int>} */
  {
    ok: 200,
    notFound: 404,
    serverError: 500
  }
);
var Shape = class {
  constructor(type, values) {
    this.type = type;
    this.values = values;
  }
  is(type) {
    return this.type === type;
  }
  static circle(radius) {
    return new Shape("circle", { radius });
  }
  static rectangle(width, height) {
    return new Shape("rectangle", { width, height });
  }
  static triangle(a, b, c) {
    return new Shape("triangle", { a, b, c });
  }
};
var os = OsType.macOS;
console.log(os);
export {
  OsType,
  Shape,
  StatusCodes
};
