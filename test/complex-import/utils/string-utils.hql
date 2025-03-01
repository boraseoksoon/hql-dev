;; test/complex-import/utils/string-utils.hql

;; Import shared utils for format handling
(def sharedUtils (import "./shared-utils.hql"))

;; Format data according to format
(defn formatData (data format)
  (let [
    normalizedFormat (sharedUtils.normalizeFormat format)
  ]
    (str 
      "Data formatted as " 
      normalizedFormat 
      ": " 
      (get data "name")
    )
  )
)

;; Truncate string to max length with ellipsis
(defn truncate (str maxLength)
  (cond
    (<= (js/String str.length) maxLength) str
    true (js/String str.substring 0 (- maxLength 3) "...")
  )
)

;; Pad string to minimum length
(defn padLeft (str minLength padChar)
  (let [
    padding (js/String "".padStart (- minLength (js/String str.length)) padChar)
  ]
    (js/String (str padding str))
  )
)

(defn padRight (str minLength padChar)
  (let [
    padding (js/String "".padEnd (- minLength (js/String str.length)) padChar)
  ]
    (js/String (str str padding))
  )
)

;; Export functions
(export "formatData" formatData)
(export "truncate" truncate)
(export "padLeft" padLeft)
(export "padRight" padRight)