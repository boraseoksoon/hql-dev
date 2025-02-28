;; hql-module.hql - Base HQL module
(defn greet (name)
  (str "hello, " name)
)

(export "greet" greet)