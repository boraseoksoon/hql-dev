;; Test NPM imports
(import lodash from "npm:lodash")

;; Define a macro that uses lodash's capitalize function
(defmacro capitalize-text (text)
  `(js-call lodash "capitalize" ~text))

;; Test HTTP imports using esm.sh CDN
(import lodash from "https://esm.sh/lodash")

;; Define a macro that uses lodash's uppercase function
(defmacro uppercase-text (text)
  `(js-call lodash "toUpper" ~text))