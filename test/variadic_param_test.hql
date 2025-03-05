;; Example HQL file showing variadic function usage

;; Define a variadic function that accepts any number of arguments
(defn sum (nums)
  (reduce nums (fn (acc n) (+ acc n)) 0))

;; Usage of the variadic function
(log (sum 1 2 3 4 5))  ;; Outputs: 15

;; A function with both regular and variadic parameters
(defn greet (name titles)
  (log (str "Hello, " 
            (if (= (reduce titles (fn (acc _) (+ acc 1)) 0) 0)
                name
                (str (reduce titles (fn (acc title) (str acc " " title)) "") " " name)))))

;; Usage with different numbers of arguments
(greet "Alice")                  ;; Outputs: Hello, Alice
(greet "Alice" "Dr.")            ;; Outputs: Hello, Dr. Alice
(greet "Alice" "Dr." "Professor") ;; Outputs: Hello, Dr. Professor Alice