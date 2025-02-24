// extra.js
import axios from "https://esm.sh/axios";  // remote dependency remains
export function extra(data) {
  // Stub: In a real scenario, you might call axios.get(...) asynchronously.
  // Here we return a computed value synchronously for bundling.
  return data + 3;
}
