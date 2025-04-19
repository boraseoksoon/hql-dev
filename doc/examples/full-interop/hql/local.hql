;; HQL Local Module
;; Demonstrates HQL importing from TypeScript and JavaScript

;; Import module from JavaScript with object
(import ts from "../typescript/local.js")

;; Import lodash from NPM (directly from HQL)
(import lodash from "npm:lodash")

;; Define a function that will be imported by JS
(fn hqlLocalFunction (x)
  (console.log "HQL processing:" x)
  
  ;; Use the imported JavaScript data
  (var person ts.tsInterfaceData)
  (console.log "Got Person data:" person.name "aged" person.age)
  
  ;; Use lodash from NPM
  (var doubled (lodash.map [1 2 3 x] (fn double (n) (* n 2))))
  (console.log "Lodash doubled in HQL:" doubled)
  
  ;; Return a computed value
  (+ (* x 3) 5))

;; Create a remote function for TypeScript to import
(fn hqlRemoteFunctionInternal (y)
  (console.log "Remote HQL function called with:" y)
  (var result (* y 4))
  (console.log "Remote HQL result:" result)
  result)

;; Export functions
(export [hqlLocalFunction hqlRemoteFunctionInternal]) 