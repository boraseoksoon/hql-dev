;; Text utilities module for HQL import testing

(defn wrap_text [text]
  (str "<<< " text " >>>"))

;; Export our functions
(export "wrap_text" wrap_text)