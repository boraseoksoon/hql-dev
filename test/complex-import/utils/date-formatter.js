// test/complex-import/utils/date-formatter.js

// Import an HQL module (bidirectional dependency)
import { padLeft } from './string-utils.js';

/**
 * Format current date with specified format
 * @param {string} format - Date format string
 * @returns {string} Formatted date string
 */
export function formatCurrentDate(format) {
  return formatDate(new Date(), format);
}

/**
 * Format a date using the specified format string
 * @param {Date} date - Date to format
 * @param {string} format - Format string (simplified)
 * @returns {string} Formatted date
 */
export function formatDate(date, format) {
  // A very simplified version of date formatting
  const tokens = {
    'yyyy': date.getFullYear(),
    'MM': padLeft(String(date.getMonth() + 1), 2, '0'),
    'dd': padLeft(String(date.getDate()), 2, '0'),
    'HH': padLeft(String(date.getHours()), 2, '0'),
    'mm': padLeft(String(date.getMinutes()), 2, '0'),
    'ss': padLeft(String(date.getSeconds()), 2, '0')
  };
  
  let result = format;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(token, value);
  }
  
  return result;
}

/**
 * Get relative time (X time ago)
 * @param {Date|string} date - Date to get relative time for
 * @returns {string} Relative time
 */
export function getRelativeTime(date) {
  const now = new Date();
  const then = date instanceof Date ? date : new Date(date);
  const diffMs = now - then;
  
  // Convert to seconds
  const diffSec = Math.round(diffMs / 1000);
  
  if (diffSec < 60) return `${diffSec} seconds ago`;
  
  // Convert to minutes
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minutes ago`;
  
  // Convert to hours
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hours ago`;
  
  // Convert to days
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 30) return `${diffDay} days ago`;
  
  // Convert to months
  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} months ago`;
  
  // Convert to years
  const diffYear = Math.round(diffMonth / 12);
  return `${diffYear} years ago`;
}