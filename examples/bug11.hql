;; ------------------------------
;; HQL Enum Implementation with Associated Values
;; ------------------------------
(enum Payment
  (case cash amount: Int)
  (case creditCard number: String expiry: String cvv: String)
  (case check accountNumber: String routingNumber: String)
)

;; Creating instances with associated values
(let payment1 (Payment.cash amount: 100))
(let payment2 (Payment.creditCard 
  number: "4111-1111-1111-1111"
  expiry: "12/25"
  cvv: "123"))

;; Using type testing
(if (js-call payment1 "is" "cash")
  (print "Cash payment of " (get (get payment1 "values") "amount"))
  (print "Not a cash payment"))

;; Process payment function - using proper cond structure with do blocks
;; Each cond clause should return a single expression
(fn processPayment (payment)
  (cond
    ;; Cash payment
    ((js-call payment "is" "cash") 
     (do
       (let amount (get (get payment "values") "amount"))
       (print "Processing cash payment of $" amount)
       "Cash payment processed"))
    
    ;; Credit card payment
    ((js-call payment "is" "creditCard")
     (do
       (let values (get payment "values"))
       (let cardNum (get values "number"))
       (let expiry (get values "expiry"))
       (print "Processing credit card " cardNum " expiring " expiry)
       "Credit card payment processed"))
    
    ;; Check payment
    ((js-call payment "is" "check")
     (do
       (let values (get payment "values"))
       (print "Processing check from account " (get values "accountNumber"))
       "Check payment processed"))
    
    ;; Default case
    (true "Unknown payment type")))

;; Testing the function
(print "Result 1:" (processPayment payment1))
(print "Result 2:" (processPayment payment2))