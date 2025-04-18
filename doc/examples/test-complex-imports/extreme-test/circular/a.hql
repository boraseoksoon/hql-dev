;; Simplified test file without circular dependencies

;; Define a value
(var baseValue 10)

;; Define a function that uses the value
(fn add5 (value)
  (+ value 5))

;; Define a function that uses our add5 function
(fn add5AndDouble (value)
  (* (add5 value) 2))

;; Main function 
(fn main ()
  (var result (add5AndDouble baseValue))
  (console.log "Calculation result:" result)
  result)

;; Export only our functions
(export [add5])
(export [add5AndDouble])

;; Run the main function
(main)
