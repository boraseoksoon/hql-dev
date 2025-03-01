// test/complex-import/helpers/config-loader.js

// Import HQL modules (bidirectional dependency)
import { normalizeFormat } from '../utils/shared-utils.hql';
import { getCurrentEnvironment } from '../config/environment-config.hql';

/**
 * Load external configuration for a specific format
 * @param {string} format - The format to load config for
 * @returns {Object} External configuration
 */
export function loadExternalConfig(format) {
  // Normalize the format using the imported HQL function
  const normalizedFormat = normalizeFormat(format);
  
  // Get current environment from imported HQL function
  const env = getCurrentEnvironment();
  
  // This would normally load from a file, but we'll simulate it
  return {
    externalSource: `external-${normalizedFormat}-${env}`,
    timestamp: new Date().toISOString(),
    loaded: true
  };
}

/**
 * Merge multiple configuration objects
 * @param {...Object} configs - Configuration objects to merge
 * @returns {Object} Merged configuration
 */
export function mergeConfigs(...configs) {
  return Object.assign({}, ...configs);
}

/**
 * Extra validation function
 * @param {Object} config - Configuration to validate
 * @returns {boolean} Is configuration valid
 */
export function validateConfig(config) {
  // Simple validation for demonstration
  return config && typeof config === 'object';
}