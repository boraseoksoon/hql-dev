;; Simple test module B

;; Import from module A
(import [aFunction] from "./a.hql")

;; Define a function that uses the import
(fn bFunction ()
  (* (aFunction) 2))

;; Export the function
(export [bFunction]) 