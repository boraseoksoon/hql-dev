// helper.js
import { extraHelperProcess } from "./extraHelper.js";
export function helperCalculate(data) {
  return data - 1 + extraHelperProcess(data);
}
