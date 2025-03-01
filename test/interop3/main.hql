;; main.hql - Entry point with nested imports
(def advancedUtils (import "./advanced-utils.hql"))

(defn main (name)
  (str 
    "Main says: " (advancedUtils.process name) "\n"
    "Version: " advancedUtils.version
  )
)

(print (main "World"))

(export "main" main)