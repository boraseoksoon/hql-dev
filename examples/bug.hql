(def list-numbers '(1 2 3 4 5))
(print list-numbers)     

(first list-numbers)     ;; => 1
(rest list-numbers)      ;; => (2 3 4 5)
(next list-numbers)      ;; => (2 3 4 5) or nil if less than 2 elements
(seq list-numbers)       ;; => (1 2 3 4 5) or nil if empty