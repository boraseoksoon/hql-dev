;; hql-submodule.hql - Pure HQL module
(defn hello (name)
  (str "hello, " name)
)

(defn goodbye (name)
  (str "goodbye, " name)
)

(export "hello" hello)
(export "goodbye" goodbye)