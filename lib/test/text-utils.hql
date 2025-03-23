(defn wrap_text (text)
  (str "<<< " text " >>>"))

(defn wrap_text2 (text)
  (str "!!!!!! " text " !!!!!!"))  

(export "wrap_text" wrap_text)
(export "wrap_text2" wrap_text2)