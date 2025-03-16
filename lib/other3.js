export function js_add(a, b) {
    console.log(`JS module: Adding ${a} and ${b}`);
    return a + b;
  }
  
  // Export as default as well for compatibility
  export default {
    js_add
  };