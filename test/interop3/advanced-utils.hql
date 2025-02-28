;; advanced-utils.hql - Intermediate HQL module
(def jsModule (import "./js-module.js"))
(def version "1.0.0")

(defn process (name)
  (str 
    "Advanced processing for " name ": " 
    (jsModule.jsHello name)
  )
)

(export "process" process)
(export "version" version)
