;; test-unified-env.hql

;; Combine macros
(defmacro format-greeting [name]
  `(str "Hello, " (lodash-capitalize ~name) "!"))

(console.log "Testing combined macros: " (format-greeting "alice"))