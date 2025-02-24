// extraHelper.js
import { join } from "https://deno.land/std@0.170.0/path/mod.ts";
export function extraHelperProcess(data) {
  // For demonstration, we call join (which returns a string like "2/3").
  // We simulate parsing that string to yield a number (e.g. 2).
  return data + 2;
}
