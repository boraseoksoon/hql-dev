// test/complex-import/helpers/js-helper.js

// Import HQL modules (bidirectional dependency)
import { getExtensionForFormat } from '../utils/shared-utils.hql';
import { padLeft, padRight } from '../utils/string-utils.hql';

/**
 * Format path information into a readable string
 * @param {string} dirName - Directory name
 * @param {string} baseName - Base file name
 * @param {string} extension - File extension
 * @returns {string} Formatted path info
 */
export function formatPathInfo(dirName, baseName, extension) {
  // Use imported HQL function for string padding
  const formattedDir = padRight(dirName, 20, ' ');
  const formattedBase = padLeft(baseName, 15, ' ');
  
  return `Directory: ${formattedDir} | File: ${formattedBase} | Extension: ${extension}`;
}

/**
 * Get suitable format for a file based on extension
 * @param {string} filePath - File path
 * @returns {string} Detected format
 */
export function detectFormat(filePath) {
  const extension = filePath.split('.').pop().toLowerCase();
  
  switch (extension) {
    case 'json': return 'json';
    case 'xml': return 'xml';
    case 'yaml':
    case 'yml': return 'yaml';
    case 'csv': return 'csv';
    default: return 'text';
  }
}

/**
 * Generate path with appropriate extension for a format
 * @param {string} basePath - Base path without extension
 * @param {string} format - Format to use
 * @returns {string} Path with extension
 */
export function generatePath(basePath, format) {
  // Use imported HQL function for extension
  const extension = getExtensionForFormat(format);
  return `${basePath}${extension}`;
}