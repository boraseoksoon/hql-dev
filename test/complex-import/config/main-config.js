import * as envConfig_module from "./environment-config.js";
const envConfig = envConfig_module.default !== undefined ? envConfig_module.default : envConfig_module;
import * as formatConfig_module from "./format-config.js";
const formatConfig = formatConfig_module.default !== undefined ? formatConfig_module.default : formatConfig_module;
import * as configLoader_module from "../helpers/config-loader.js";
const configLoader = configLoader_module.default !== undefined ? configLoader_module.default : configLoader_module;
const appName = "HQL Demo Application";
const appVersion = "1.0.0";
const appDescription = "Demonstrate HQL features and imports";
function getConfig(format) {
  {
  const baseConfig = {app: {name: appName, version: appVersion, description: appDescription}, environment: envConfig.getCurrentEnvironment()};
  const formatSettings = formatConfig.getFormatSettings(format);
  const externalConfig = configLoader.loadExternalConfig(format);
  return {
  base: baseConfig,
  format: formatSettings,
  external: externalConfig,
  combined: configLoader.mergeConfigs(baseConfig, formatSettings, externalConfig)
};
}
}
export { getConfig };
export { appName };
export { appVersion };
export { appDescription };
