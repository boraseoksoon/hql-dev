;; lib/lazy_seq.hql - Lazy sequence utilities for HQL

;; Helper to create a generator function using Function constructor
(def create-generator
  (js-call Function "constructor" 
           "genFnBody" 
           "return new Function('...args', `return (function*() { ${genFnBody} })(...args);`);"))

;; Create the range generator function
(def range-gen
  (js-call create-generator "call" nil
           "const [start, end, step] = args;
            let current = start;
            while (step > 0 ? current < end : current > end) {
              yield current;
              current += step;
            }"))

;; Base range function that creates a generator instance
(defn make-range [start end step]
  (js-call range-gen "call" nil start end step))

;; Convert generator to array (fully realizes it)
(defn realize [gen]
  (js-call Array "from" gen))

;; Take first n elements from generator
(defn take [n gen]
  (def result [])
  (def iterator (js-call gen "next"))
  (def count 0)
  
  (while (and (< count n) 
              (not (js-get iterator "done")))
    (js-call result "push" (js-get iterator "value"))
    (def iterator (js-call gen "next"))
    (def count (+ count 1)))
  
  result)

;; Map function over lazy sequence
(def map-gen
  (js-call create-generator "call" nil
           "const [gen, mapFn] = args;
            for (const item of gen) {
              yield mapFn(item);
            }"))

(defn map-lazy [f gen]
  (js-call map-gen "call" nil gen f))

;; Filter lazy sequence
(def filter-gen
  (js-call create-generator "call" nil
           "const [gen, predFn] = args;
            for (const item of gen) {
              if (predFn(item)) {
                yield item;
              }
            }"))

(defn filter-lazy [pred gen]
  (js-call filter-gen "call" nil gen pred))

;; Reduce over lazy sequence
(defn reduce-lazy [f initial gen]
  (def result initial)
  (def iterator (js-call gen "next"))
  
  (while (not (js-get iterator "done"))
    (def result (f result (js-get iterator "value")))
    (def iterator (js-call gen "next")))
  
  result)

;; Range macro with multiple arities
(defmacro range [& args]
  (cond
    ((= (length args) 0) 
     (list 'make-range 0 0 1))
    ((= (length args) 1) 
     (list 'make-range 0 (first args) 1))
    ((= (length args) 2) 
     (list 'make-range (first args) (second args) 1))
    ((= (length args) 3) 
     (list 'make-range (first args) (second args) (nth args 2)))))

;; Export functions
(export "range" range)
(export "realize" realize)
(export "take" take)
(export "map-lazy" map-lazy)
(export "filter-lazy" filter-lazy)
(export "reduce-lazy" reduce-lazy)