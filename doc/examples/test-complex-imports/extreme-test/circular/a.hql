;; Simplified test file without circular dependencies

;; Define a value
(var baseValue 10)

;; Define a function that uses the value
(fn add5 (value)
  (+ value 5))

;; Define a function that uses our add5 function
(fn add5AndDouble (value)
  (* (add5 value) 2))

;; Main function renamed to circularFunction to match imports
(fn circularFunction ()
  (var result (add5AndDouble baseValue))
  (console.log "Calculation result:" result)
  result)

;; Export our functions, including circularFunction
(export [add5])
(export [add5AndDouble])
(export [circularFunction])

;; Run the main function
(circularFunction)
