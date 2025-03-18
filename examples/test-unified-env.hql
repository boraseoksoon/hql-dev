;; test-unified-env.hql

;; Import lodash
(import lodash "npm:lodash@4.17.21")

;; Use the lodash-capitalize macro from core.hql
(console.log "Macro test:" (lodash-capitalize "this text should be capitalized"))

;; Define a local macro 
(defmacro double (x)
  `(* ~x 2))

;; Use the local macro
(console.log "Local macro result:" (double 5))

;; Define a composed macro using lodash-capitalize
(defmacro format-name (first last)
  `(str (lodash-capitalize ~first) " " (lodash-capitalize ~last)))

;; Use the composed macro
(console.log "Composed macro result:" (format-name "john" "doe"))