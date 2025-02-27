export function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  // Get current timestamp
  export function getTimestamp() {
    return new Date().toISOString();
  }