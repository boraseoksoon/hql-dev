;; test/complex-import/utils/shared-utils.hql

;; Import external library for string manipulation
(def strUtils (import "npm:lodash"))

;; Normalize format string
(defn normalizeFormat (format)
  (let [
    lowerFormat (strUtils.lowerCase format)
  ]
    (cond
      (= lowerFormat "json") "json"
      (= lowerFormat "xml") "xml"
      (= lowerFormat "yaml") "yaml"
      (= lowerFormat "yml") "yaml"
      (= lowerFormat "csv") "csv"
      true "text"
    )
  )
)

;; Get file extension for format
(defn getExtensionForFormat (format)
  (let [
    normalizedFormat (normalizeFormat format)
  ]
    (cond
      (= normalizedFormat "json") ".json"
      (= normalizedFormat "xml") ".xml"
      (= normalizedFormat "yaml") ".yaml"
      (= normalizedFormat "csv") ".csv"
      true ".txt"
    )
  )
)

;; Generate file name with appropriate extension
(defn generateFileName (baseName format)
  (str baseName (getExtensionForFormat format))
)

;; Export functions
(export "normalizeFormat" normalizeFormat)
(export "getExtensionForFormat" getExtensionForFormat)
(export "generateFileName" generateFileName)