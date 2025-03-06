;; Data Structure Macros - corrected versions

;; fx macro - implementing the exact 5 supported patterns
(defmacro fx (name params & body)
  ;; Extract return type if present
  (let [has-return-type (and (> (count body) 0) (= (first body) '->))
        return-type (if (and has-return-type (> (count body) 1)) 
                       (nth body 1) 
                       nil)
        ;; Skip the return type annotation
        actual-body (if has-return-type 
                     (rest (rest body))
                     body)]
    
    ;; Extract information about the parameters
    ;; We'll save this information as metadata on the result
    ;; to be used by the transformer
    
    ;; Just return the basic expansion to defn
    ;; The transformer will handle the parameter types and defaults
    (let [result (list 'defn name params 
                      (cons 'do actual-body))]
      
      ;; Attach information that this is an fx form (for the transpiler)
      (set! (.-isFx result) true)
      
      ;; Return the result
      result)))

;; JS-style array literals: [1, 2, 3]
(defmacro js-array (& elements)
  ;; Direct transformation to array literal
  (list 'array elements))

;; JS-style object literals: {"name": "value"}
(defmacro js-map (& pairs)
  ;; Direct transformation to object literal with proper key-value pairs
  (let [obj (list 'object)]
    (do
      (for ((i 0) (< i (count pairs)) (+ i 2))
        (let [key (nth pairs i)
              has-next-value (< (+ i 1) (count pairs))
              value (if has-next-value (nth pairs (+ i 1)) nil)]
          (if has-next-value
            (set! obj (concat obj (list key value)))
            (void))))
      obj)))

;; JS-style set literals: #[1, 2, 3]
(defmacro js-set (& elements)
  ;; Direct transformation to Set constructor
  (list 'new 'Set (list 'array elements)))

;; Base data structure implementations - simplified
(defmacro array (& elements)
  ;; Just return the array form directly
  (list 'array elements))

(defmacro object (& key-values)
  ;; Just return the object form directly
  (list 'object key-values))

