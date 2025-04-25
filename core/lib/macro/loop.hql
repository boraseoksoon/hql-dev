;; ====================================================
;; HQL Loop Constructs Library - Enhanced Version
;; This library implements a series of looping constructs
;; built on the fundamental loop/recur mechanism
;; ====================================================

;; ====================
;; 1. While Loop
;; ====================

;; Simple while loop - repeats body as long as condition is true
;; Example usage:
;; (var count 0)
;; (while (< count 5)
;;   (print count)
;;   (set! count (+ count 1)))
(macro while (condition & body)
  `(loop ()
     (if ~condition
       (do
         ~@body
         (recur))
       nil)))

;; ====================
;; 2. Repeat Loop
;; ====================

;; Simple repeat loop - repeats body a specific number of times
;; Example usage:
;; (repeat 3 (print "hello"))
(macro repeat (count & body)
  `(loop (i 0)
     (if (< i ~count)
       (do
         ~@body
         (recur (+ i 1)))
       nil)))

;; ====================
;; 3. Enhanced For Loop
;; ====================

;; Unified for loop - handles both positional and named arguments
;; Supports multiple styles:
;;
;; Traditional style:
;; (for (i 10) ...) - iterates i from 0 to 9
;; (for (i 5 10) ...) - iterates i from 5 to 9
;; (for (i 0 10 2) ...) - iterates i from 0 to 9 by steps of 2
;;
;; Named parameter style (using symbols, not strings):
;; (for (i to: 10) ...) - iterates i from 0 to 9
;; (for (i from: 5 to: 10) ...) - iterates i from 5 to 9
;; (for (i from: 0 to: 10 by: 2) ...) - iterates i from 0 to 9 by steps of 2
(macro for (binding & body)
  (let (var (first binding))
    (cond
      ;; Case: (for (i to: 10) ...)
      ((and (= (length binding) 3)
            (symbol? (nth binding 1))
            (= (name (nth binding 1)) "to:"))
       `(loop (~var 0)
          (if (< ~var ~(nth binding 2))
            (do
              ~@body
              (recur (+ ~var 1)))
            nil)))
      
      ;; Case: (for (i to: 10 by: 2) ...)
      ((and (= (length binding) 5)
            (symbol? (nth binding 1))
            (= (name (nth binding 1)) "to:")
            (symbol? (nth binding 3))
            (= (name (nth binding 3)) "by:"))
       `(loop (~var 0)
          (if (< ~var ~(nth binding 2))
            (do
              ~@body
              (recur (+ ~var ~(nth binding 4))))
            nil)))
      
      ;; Case: (for (i from: 0 to: 10) ...)
      ((and (= (length binding) 5)
            (symbol? (nth binding 1))
            (= (name (nth binding 1)) "from:")
            (symbol? (nth binding 3))
            (= (name (nth binding 3)) "to:"))
       `(loop (~var ~(nth binding 2))
          (if (< ~var ~(nth binding 4))
            (do
              ~@body
              (recur (+ ~var 1)))
            nil)))
      
      ;; Case: (for (i from: 0 to: 10 by: 2) ...)
      ((and (= (length binding) 7)
            (symbol? (nth binding 1))
            (= (name (nth binding 1)) "from:")
            (symbol? (nth binding 3))
            (= (name (nth binding 3)) "to:")
            (symbol? (nth binding 5))
            (= (name (nth binding 5)) "by:"))
       `(loop (~var ~(nth binding 2))
          (if (< ~var ~(nth binding 4))
            (do
              ~@body
              (recur (+ ~var ~(nth binding 6))))
            nil)))
      
      ;; Original cases unchanged
      ;; Case: (for (i 10) ...) - iterates i from 0 to 9
      ((= (length binding) 2)
       `(loop (~var 0)
          (if (< ~var ~(second binding))
            (do
              ~@body
              (recur (+ ~var 1)))
            nil)))
      
      ;; Case: (for (i 5 10) ...) - iterates i from 5 to 9
      ((= (length binding) 3)
       `(loop (~var ~(second binding))
          (if (< ~var ~(nth binding 2))
            (do
              ~@body
              (recur (+ ~var 1)))
            nil)))
      
      ;; Case: (for (i 0 10 2) ...) - iterates i from 0 to 9 by steps of 2
      ((= (length binding) 4)
       `(loop (~var ~(second binding))
          (if (< ~var ~(nth binding 2))
            (do
              ~@body
              (recur (+ ~var ~(nth binding 3))))
            nil)))
      
      ;; Default case - better error handling
      (true `(throw (str "Invalid 'for' loop binding: " '~binding))))))
