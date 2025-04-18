// js-remote-consumer.js - JavaScript file importing HQL that has remote imports
import { formatDateTime } from './remote-utils.hql';

console.log("JS file importing HQL with remote dependencies");
console.log("Formatted current time:", formatDateTime());

// Test error handling
try {
  console.log("Testing formatDateTime with custom format:", 
    formatDateTime(new Date(), "YYYY-MM-DD"));
} catch (error) {
  console.log("Error test caught:", error.message);
} 