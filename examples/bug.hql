(def list-numbers '(1 2 3 4 5))
(def list-numbers2 [])
(print list-numbers)     

(print (first list-numbers))     ;; => 1
(print (rest list-numbers))     ;; => (2 3 4 5)
(print (next list-numbers))      ;; => (2 3 4 5) or nil if less than 2 elements
(print (seq list-numbers))       ;; => (1 2 3 4 5) or nil if empty
(print (seq list-numbers2))     ;; => nil   