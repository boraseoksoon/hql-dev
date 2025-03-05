;; HQL Standard Macros Library
;; Contains implementations of extended syntax using macros

;; =========================================================
;; Data Structure Macros
;; =========================================================

;; JSON object literal macro - transforms object literals to hash-maps
;; Usage: {"key": value} -> (js-map "key" value)
;; Expands to: (hash-map (keyword "key") value)
(defmacro js-map (& pairs)
  (let [result (list 'hash-map)]
    (do
      ;; Process pairs in groups of 2 (key, value)
      (for ((i 0) (< i (count pairs)) (+ i 2))
        (let [key (nth pairs i)
              has-next-value (< (+ i 1) (count pairs))
              value (if has-next-value (nth pairs (+ i 1)) nil)]
          ;; Add (keyword key) and value to result
          (set! result (concat result 
                              (list (list 'keyword key)) 
                              (if has-next-value (list value) (list))))))
      result)))

;; JSON array literal macro - transforms array literals to vectors
;; Usage: [1, 2, 3] -> (js-array 1 2 3)
;; Expands to: (vector 1 2 3)
(defmacro js-array (& elements)
  (concat (list 'vector) elements))

;; Set literal macro - transforms set literals to JS Set constructor
;; Usage: #[1, 2, 3] -> (js-set 1 2 3)
;; Expands to: (new Set (vector 1 2 3))
(defmacro js-set (& elements)
  (list 'new 'Set (concat (list 'vector) elements)))

;; =========================================================
;; Extended Function Definition Macros
;; =========================================================

;; Helper to check if a parameter has a type annotation
(defn has-type-annotation? (param)
  (and (list? param) 
       (> (count param) 2) 
       (= (nth param 1) ':)))

;; Helper to extract parameter name
(defn param-name (param)
  (if (list? param)
    (nth param 0)
    param))


;; Helper to extract parameter type if present
(defn param-type (param)
  (if (and (list? param) (has-type-annotation? param))
    (nth param 2)
    nil))

;; Helper to check if a parameter has a default value
(defn has-default-value? (param)
  (and (list? param)
       (> (count param) 2)
       (let [eq-pos (position '= param)]
         (not (= eq-pos -1)))))

;; Helper to extract parameter default value if present
(defn param-default-value (param)
  (if (and (list? param) (has-default-value? param))
    (let [eq-pos (position '= param)]
      (nth param (+ eq-pos 1)))
    nil))

;; Helper to check if a parameter is named (ends with :)
(defn is-named-param? (param)
  (if (symbol? param)
    (ends-with? (str param) ":")
    (and (list? param)
         (symbol? (first param))
         (ends-with? (str (first param)) ":"))))

;; Helper to normalize parameter name (remove : suffix)
(defn normalize-param-name (name)
  (if (ends-with? (str name) ":")
    (substring (str name) 0 (- (count (str name)) 1))
    (str name)))

;; Extended function definition macro
;; Usage: (fx name (params...) body...)
;; Handles type annotations, named parameters, and default values
;; Extended function definition macro
;; Usage: (fx name (params...) body...)
;; Handles type annotations, named parameters, and default values
(defmacro fx (name params & body)
  (let [
    ;; Check for return type annotation
    has-return-type (and (> (count body) 1)
                         (= (nth body 0) '->))
    return-type (if has-return-type (nth body 1) nil)
    
    ;; Extract the actual function body
    actual-body (if has-return-type
                  (rest (rest body))
                  body)
    
    ;; Process parameters
    processed-params (list)
    has-named-params false
    has-optional-params false
  ]
    (do
      ;; Process each parameter
      (for ((i 0) (< i (count params)) (+ i 1))
        (let [param (nth params i)]
          (do
            ;; Check if this is a named parameter
            (if (is-named-param? param)
              (set! has-named-params true)
              nil)
            
            ;; Check if it has a default value
            (if (has-default-value? param)
              (set! has-optional-params true)
              nil)
            
            ;; Add to processed params
            (set! processed-params (concat processed-params (list param))))))
      
      ;; Generate the appropriate defun form based on parameter types
      (if has-named-params
        ;; Named parameter version using a single "params" parameter
        (list 'defun name 
              (list 'params)
              (list 'let 
                    (list (list '{} 
                                (map (fn (p) 
                                       (symbol (normalize-param-name (param-name p))))
                                     processed-params)
                                'params)
                    (concat actual-body)))
        
        ;; Regular parameter version with optional handling
        (if has-optional-params
          ;; Has optional parameters
          (let [
            regular-params (filter (fn (p) (not (has-default-value? p))) processed-params)
            optional-params (filter has-default-value? processed-params)
            param-list (concat 
                         (map param-name regular-params)
                         (list '&optional)
                         (map (fn (p) 
                                (list (param-name p) (param-default-value p)))
                              optional-params))
          ]
            (list 'defun name
                  param-list
                  (concat actual-body)))
          
          ;; Simple case - no optionals or named parameters
          (list 'defun name
                (map param-name processed-params)
                (concat actual-body)))))))

;; =========================================================
;; Control Flow Macros
;; =========================================================

;; When macro - execute body when condition is true
(defmacro when (condition & body)
  (list 'if condition 
        (cons 'do body)
        nil))

;; Unless macro - execute body when condition is false
(defmacro unless (condition & body)
  (list 'if 
        (list 'not condition)
        (cons 'do body)
        nil))

;; =========================================================
;; Loop Constructs
;; =========================================================

;; For loop macro - handles both list comprehension and imperative styles
;; Examples:
;; (for (x items) expr)               ;; List comprehension style
;; (for ((i 0) (< i 10) (+ i 1)) ...) ;; Imperative style
(defmacro for (binding-or-bindings & body)
  (if (and (list? (first binding-or-bindings))
           (= (count (first binding-or-bindings)) 2))
    ;; List comprehension style: (for ((x coll)) expr)
    (let [var (first (first binding-or-bindings))
          coll (second (first binding-or-bindings))]
      (list 'map (list 'fn (list var) (first body)) coll))
    
    ;; Imperative style: (for ((i 0) (< i 10) (+ i 1)) body)
    (let [init (first binding-or-bindings)
          test (second binding-or-bindings)
          update (third binding-or-bindings)
          loop-var (first init)
          start-val (second init)
          loop-name (symbol (str "loop_" loop-var))]
      (list 'let (list (list loop-var start-val)
                       (list loop-name (list 'fn)))
            (list 'if test
                  (list 'do
                        (cons 'do body)
                        (list 'set! loop-var update)
                        (list loop-name))
                  nil)))))

;; =========================================================
;; Threading Macros
;; =========================================================

;; Thread-first macro (->) for chaining operations
;; Example: (-> x (f) (g)) expands to (g (f x))
(defmacro -> (x & forms)
  (reduce forms
          (fn (result form)
            (if (list? form)
              (cons (first form) (cons result (rest form)))
              (list form result)))
          x))

;; Thread-last macro (->>) for chaining operations
;; Example: (->> x (f) (g)) expands to (g (f x))
(defmacro ->> (x & forms)
  (reduce forms
          (fn (result form)
            (if (list? form)
              (concat form (list result))
              (list form result)))
          x))