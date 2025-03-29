;; Test 1: when-let with truthy value (single expression)

(fn get-user-by-id (id)
  (if (= id 123)
      {"name": "John", "email": "john@example.com"}
      nil))

(print "Test 1: when-let with truthy value (single expression)")
(when-let (user (get-user-by-id 123))
  (print "User found:" (get user "name")))
;; User found: John