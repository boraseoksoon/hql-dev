;; 5. Return from deeply nested condition
(fn deep-conditional-return (x)
  (return ;; Return the result of the entire nested if structure
    (if (> x 10) ;; Outer if
      (if (> x 20) ;; Middle if
        (if (> x 30) ;; Inner if
          "very large"  ;; Consequent for inner if (x > 30)
          "large")      ;; Alternate for inner if (x <= 30 but > 20)
        "medium")       ;; Alternate for middle if (x <= 20 but > 10)
      "small")))        ;; Alternate for outer if (x <= 10)

;; Testing the function
(print "deep conditional (40): " (deep-conditional-return 40)) ;; Should print "very large"
(print "deep conditional (25): " (deep-conditional-return 25)) ;; Should print "large"
(print "deep conditional (15): " (deep-conditional-return 15)) ;; Should print "medium"
(print "deep conditional (5): " (deep-conditional-return 5))   ;; Should print "small"