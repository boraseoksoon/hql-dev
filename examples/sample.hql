;; --- Test Data Structures ---

;; 1. Set (using JS Set)
(def my-set #[1, 2, 3])
(print "Set test:")
(print (contains? my-set 2))  ;; Expected output: true
(print (contains? my-set 4))  ;; Expected output: false

;; 2. Map (using JS object literal)
(def my-map {"name": "Alice", "status": "active"})
(print "Map test:")
(print (contains? my-map "name"))  ;; Expected output: true
(print (contains? my-map "age"))   ;; Expected output: false

;; 3. Array / Vector (using vector constructor)
(def my-array (vector 10 20 30))
(print "Array (Vector) test:")
(print (contains? my-array 1))  ;; Expected output: true  (index 1 exists)
(print (contains? my-array 3))  ;; Expected output: false (index 3 is out of bounds)
