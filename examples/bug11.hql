;; 5. Return from deeply nested condition
(fn deep-conditional-return (x)
  (if (> x 10)
      (if (> x 20)
          (if (> x 30)
              (return "very large")  ;; Deeply nested return
              "large")
          "medium")
      "small"))

(print "deep conditional (40): " (deep-conditional-return 40))  ;; Should print "very large"
(print "deep conditional (25): " (deep-conditional-return 25))  ;; Should print "large"
(print "deep conditional (15): " (deep-conditional-return 15))  ;; Should print "medium"
(print "deep conditional (5): " (deep-conditional-return 5))    ;; Should print "small"