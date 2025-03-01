import * as envConfig from "./environment-config.js";
import * as formatConfig from "./format-config.js";
import * as configLoader from "../helpers/config-loader.js";
const appName = "HQL Demo Application";
const appVersion = "1.0.0";
const appDescription = "Demonstrate HQL features and imports";
function getConfig(format) {
  {
  const baseConfig = {[":app"]: {[":name"]: appName, [":version"]: appVersion, [":description"]: appDescription}, [":environment"]: envConfig.getCurrentEnvironment()};
  const formatSettings = formatConfig.getFormatSettings(format);
  const externalConfig = configLoader.loadExternalConfig(format);
  return {[":base"]: baseConfig, [":format"]: formatSettings, [":external"]: externalConfig, [":combined"]: configLoader.mergeConfigs(baseConfig, formatSettings, externalConfig)};
}
}
export { getConfig };
export { appName };
export { appVersion };
export { appDescription };
