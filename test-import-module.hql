;; Test importing from local module

(print "Testing local module imports:\n")

;; Import from test-module.hql
(import [add, multiply, greet] from "./test-module.hql")

(print "Add 5 + 3:" (add 5 3))
(print "Multiply 4 * 7:" (multiply 4 7))
(print "Greet:" (greet "HQL"))

(print "\n✅ Local module imports work perfectly!")