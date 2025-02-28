;; hql-module.hql - HQL module that imports other modules
(def hqlSubMod (import "./hql-submodule.hql"))  ;; HQL submodule
(def jsUtil (import "./js-util.js"))            ;; JS utility module

(defn greet (name)
  (str 
    (jsUtil.capitalize (hqlSubMod.hello name))
    " (" (jsUtil.getTimestamp) ")"
  )
)

(export "greet" greet)