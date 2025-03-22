;;  where promising new hql syntax is noted.



;;;;;;;;;;; fx

;; advanced defn with type and named and default parameter 

(fx add (a: Int b: Int = 0) (-> Int)
  (+ a b)

(add a: 10 b: 20)

;;;;;;;;;;; class

;; native lisp class abstraction

(class Person
  (fields
    (name)         ;; required field
    (age)          ;; required field
    (x 10)         ;; field with default value 10
    (y nil))       ;; field with default nil (e.g. for dependency injection)

  (methods
    (defn greet (self)
      (+ "Hello, " self.name))

    (defn celebrateBirthday (self newAge)
      (do
        (set! self.age newAge)
        self))))


;; Creating an instance:
(def p (new Person "Alice" 30))

;; Accessing a property:
(p.name)

;; Calling methods:
(p.greet)              ;; => "Hello, Alice"
(p.age)                ;; => 31
(p.celebrateBirthday 31)

;;;;;;;;;;; For Loop Examples

;; Imperative loop:
(for (set i 0) (< i 10) (set i (+ i 1))
  (print i))

;; Range loop:
(for (i (range 0 10))
  (print i))

;;;;;;;;;;;; bug fix 

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 9. cond
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Multi-condition number classification
(defn classify-number (n)
  (cond
    ((> n 100) "large")
    ((> n 50) "medium")
    ((> n 10) "small")
    ((> n 0) "tiny")
    ((= n 0) "zero")
    (true "negative")))  ;; Default case using "true" condition

;; HTTP status code handler
(defn handle-status (code)
  (cond
    ((= code 200) "OK")
    ((= code 404) "Not Found")
    ((= code 500) "Server Error")
    (true "Unknown status")))

;; Type-based formatting
(defn format-value (value)
  (cond
    ((nil? value) "N/A")
    ((number? value) (+ "$" value))
    ((boolean? value) (if value "Yes" "No"))
    (true (to-string value))))

;; without () it could work.