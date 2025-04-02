;; Minimal test for enum with associated values
(enum Payment
  (case cash amount: Int)
)

;; Creating an instance with associated value
(let payment (Payment.cash amount: 100))
