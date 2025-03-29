;; -------------------------
;; Testing Lambdas
;; -------------------------
(print "\n## Lambda Return Tests ##\n")

;; 1. Implicit return in lambda
(let (implicit-lambda (lambda (x) (-> Int)
                        (* x 2)))  ;; last expression is returned implicitly
  (print "lambda implicit return: " (implicit-lambda 5)))  ;; Should print 10

;; 2. Explicit return in lambda
(let (explicit-lambda (lambda (x) (-> Int)
                        (return (* x 2))))  ;; explicit return
  (print "lambda explicit return: " (explicit-lambda 5)))  ;; Should print 10

;; 3. Early return in lambda
(let (early-lambda (lambda (x) (-> Int)
                     (if (< x 0)
                         (return 0)  ;; early return
                         (* x 2))))
  (print "lambda early return (negative): " (early-lambda -5))  ;; Should print 0
  (print "lambda no early return (positive): " (early-lambda 5)))  ;; Should print 10

;; 4. Multiple statements in lambda body with implicit return
(let (multi-lambda (lambda (x) (-> Int)
                     (let (a (* x 2))
                       (let (b (+ a 1))
                         b))))  ;; implicit return of last expression
  (print "lambda multi-statement: " (multi-lambda 5)))  ;; Should print 11

;; 5. Multiple statements with explicit return
(let (multi-explicit-lambda (lambda (x) (-> Int)
                              (let (a (* x 2))
                                (let (b (+ a 1))
                                  (return b)))))
  (print "lambda multi-statement explicit: " (multi-explicit-lambda 5)))  ;; Should print 11