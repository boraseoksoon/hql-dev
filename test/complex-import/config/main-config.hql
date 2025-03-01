;; test/complex-import/config/main-config.hql

;; Import other config modules
(def envConfig (import "./environment-config.hql"))
(def formatConfig (import "./format-config.hql"))

;; Import JS helper that itself imports HQL
(def configLoader (import "../helpers/config-loader.js"))

;; Basic configuration properties
(def appName "HQL Demo Application")
(def appVersion "1.0.0")
(def appDescription "Demonstrate HQL features and imports")

;; Get merged configuration
(defn getConfig (format)
  (let [
    baseConfig (hash-map
      (keyword "app") (hash-map
        (keyword "name") appName
        (keyword "version") appVersion
        (keyword "description") appDescription
      )
      (keyword "environment") (envConfig.getCurrentEnvironment)
    )
    formatSettings (formatConfig.getFormatSettings format)
    externalConfig (configLoader.loadExternalConfig format)
  ]
    (hash-map
      (keyword "base") baseConfig
      (keyword "format") formatSettings
      (keyword "external") externalConfig
      (keyword "combined") (configLoader.mergeConfigs baseConfig formatSettings externalConfig)
    )
  )
)

;; Export functions
(export "getConfig" getConfig)
(export "appName" appName)
(export "appVersion" appVersion)
(export "appDescription" appDescription)