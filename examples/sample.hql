;; expanded-example.hql - Demonstrates data structures with dot access

;; ========== Vector with Array Methods ==========
(def numbers [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
(console.log "Vector:" numbers)

;; Using dot access for array methods
(def doubled (numbers.map (fn (n) (* n 2))))
(console.log "Doubled:" doubled)

(def evens (numbers.filter (fn (n) (= (% n 2) 0))))
(console.log "Even numbers:" evens)

(def sum (numbers.reduce (fn (acc n) (+ acc n)) 0))
(console.log "Sum of numbers:" sum)

;; Nesting the method calls
(def processed (((numbers.filter (fn (n) (> n 3))).map (fn (n) (* n 3))).slice 0 3))
                 
(console.log "Processed:" processed)