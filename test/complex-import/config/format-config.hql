;; test/complex-import/config/format-config.hql
(def sharedUtils (import "../utils/shared-utils.hql"))

;; Format settings
(def formatSettings (hash-map
  (keyword "json") (hash-map
    (keyword "indent") 2
    (keyword "pretty") true
    (keyword "contentType") "application/json"
  )
  (keyword "xml") (hash-map
    (keyword "indent") 4
    (keyword "header") true
    (keyword "contentType") "application/xml"
  )
  (keyword "yaml") (hash-map
    (keyword "indent") 2
    (keyword "flowStyle") false
    (keyword "contentType") "application/yaml"
  )
  (keyword "csv") (hash-map
    (keyword "delimiter") ","
    (keyword "header") true
    (keyword "contentType") "text/csv"
  )
  (keyword "text") (hash-map
    (keyword "encoding") "utf-8"
    (keyword "contentType") "text/plain"
  )
))

;; Get settings for a specific format
(defn getFormatSettings (format)
  (let [
    normalizedFormat (sharedUtils.normalizeFormat format)
  ]
    (cond
      (get formatSettings normalizedFormat) (get formatSettings normalizedFormat)
      true (get formatSettings "text") ;; default to text format
    )
  )
)

;; Get content type for a format
(defn getContentType (format)
  (let [
    settings (getFormatSettings format)
  ]
    (get settings "contentType")
  )
)

;; Export functions
(export "getFormatSettings" getFormatSettings)
(export "getContentType" getContentType)
(export "formatSettings" formatSettings)