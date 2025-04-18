;; Simplified test file for circular dependencies A

;; Define a value
(var baseValue 10)

;; Define a function that uses the value
(fn add5 (value)
  (+ value 5))

;; Main function
(fn circularFunction ()
  (var result (add5 baseValue))
  (console.log "Calculation result:" result)
  result)

;; Export function
(export [circularFunction])

;; Run the function
(circularFunction) 