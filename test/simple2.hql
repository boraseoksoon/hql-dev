;; simple2.hql
(def mod3 (import "./simple3.hql"))
(defn sayHi (name)
  (str "Hi, " name "! " (mod3.sayBye name))
)

(export "sayHi" sayHi)
