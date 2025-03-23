// A formatter module for testing JS imports

// Export the formatText function directly
export function formatText(text) {
    return `*** ${text} ***`;
  }
  
  // Also export a default object with the same function
  // This provides two ways to import it
  export default {
    formatText: function(text) {
      return `*** ${text} ***`;
    }
  };