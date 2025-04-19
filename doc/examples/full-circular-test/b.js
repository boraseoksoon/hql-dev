import { hqlFunction } from "./a.hql";
function transformWithTs(x) {
  console.log("TypeScript transformWithTs called with:", x);
  const hqlResult = hqlFunction(x);
  console.log("HQL result in TS:", hqlResult);
  return hqlResult * 2;
}
function formatInTs(value) {
  console.log("TypeScript formatInTs called with:", value);
  return `[TS] ${value}`;
}
const TS_VERSION = "1.0.0";
const TS_NAME = "TypeScript Module B";
export {
  TS_NAME,
  TS_VERSION,
  formatInTs,
  transformWithTs
};
