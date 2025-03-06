;; HQL Macros
;; ================================
;; This file contains all macros for:
;; 1) Data Structures
;; 2) Extended Function (fx)
;; 3) Control Flow (when/unless)
;; 4) Loop Constructs (for)
;; 5) Threading Macros (->, ->>)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 1) Data Structure Macros
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defmacro js-map (& pairs)
  ;; Transforms { "key": val } => (hash-map (keyword "key") val)
  (let [result (list 'hash-map)]
    (do
      (for ((i 0) (< i (count pairs)) (+ i 2))
        (let [key (nth pairs i)
              has-next-value (< (+ i 1) (count pairs))
              value (if has-next-value (nth pairs (+ i 1)) nil)]
          (set! result
                (concat result
                        (list (list 'keyword key))
                        (if has-next-value (list value) (list)))))))
    result))

(defmacro js-array (& elements)
  ;; Transforms [1,2,3] => (vector 1 2 3)
  (concat (list 'vector) elements))

(defmacro js-set (& elements)
  ;; Transforms #[1,2,3] => (new Set (vector 1 2 3))
  (list 'new 'Set (concat (list 'vector) elements)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 2) Extended Function Definition (fx) Macro
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Helper: check if a parameter has a type annotation
(defn has-type-annotation? (param)
  (and (list? param)
       (> (count param) 2)
       (= (nth param 1) ':)))

;; Helper: extract parameter name
(defn param-name (param)
  (if (list? param)
    (nth param 0)
    param))

;; Helper: extract parameter type if present
(defn param-type (param)
  (if (and (list? param) (has-type-annotation? param))
    (nth param 2)
    nil))

;; Helper: check if param has default value
(defn has-default-value? (param)
  (and (list? param)
       (> (count param) 2)
       (let [eq-pos (position '= param)]
         (not (= eq-pos -1)))))

;; Helper: get the parameter default value
(defn param-default-value (param)
  (if (and (list? param) (has-default-value? param))
    (let [eq-pos (position '= param)]
      (nth param (+ eq-pos 1)))
    nil))

;; Helper: check if param is named (ends with ":")
(defn is-named-param? (param)
  (if (symbol? param)
    (ends-with? (str param) ":")
    (and (list? param)
         (symbol? (first param))
         (ends-with? (str (first param)) ":"))))

;; Helper: remove ":" suffix from parameter name
(defn normalize-param-name (name)
  (if (ends-with? (str name) ":")
    (substring (str name) 0 (- (count (str name)) 1))
    (str name)))

;; Extended function definition macro - simplified with parameter handling
;; Completely rewritten fx macro 


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 3) Control Flow Macros
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defmacro when (condition & body)
  (list 'if condition
        (cons 'do body)
        nil))

(defmacro unless (condition & body)
  (list 'if
        (list 'not condition)
        (cons 'do body)
        nil))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 4) Loop Constructs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defmacro for (binding-or-bindings & body)
  (if (and (list? (first binding-or-bindings))
           (= (count (first binding-or-bindings)) 2))
    ;; List comprehension style
    (let [var  (first (first binding-or-bindings))
          coll (second (first binding-or-bindings))]
      (list 'map (list 'fn (list var) (first body)) coll))
    ;; Imperative style
    (let [init      (first binding-or-bindings)
          test      (second binding-or-bindings)
          update    (third binding-or-bindings)
          loop-var  (first init)
          start-val (second init)
          loop-name (symbol (str "loop_" loop-var))]
      (list 'let
            (list
              (list loop-var start-val)
              (list loop-name (list 'fn)))
            (list 'if test
                  (list 'do
                        (cons 'do body)
                        (list 'set! loop-var update)
                        (list loop-name))
                  nil)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 5) Threading Macros
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defmacro -> (x & forms)
  (reduce forms
          (fn (result form)
            (if (list? form)
              (cons (first form) (cons result (rest form)))
              (list form result)))
          x))

(defmacro ->> (x & forms)
  (reduce forms
          (fn (result form)
            (if (list? form)
              (concat form (list result))
              (list form result)))
          x))