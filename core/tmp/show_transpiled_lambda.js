// This script will print the transpiled output for lambda return tests
import { readFileStrSync } from "https://deno.land/std/fs/mod.ts";
console.log(readFileStrSync("../doc/examples/return.transpiled.js"));
