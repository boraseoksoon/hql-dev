(var person { "name": "John", "age": 30, "hobbies": ["coding", "reading", "hiking"] })

;; Example 7: Object property manipulation
(print "\n7. Object property manipulation:")
(print (person
  .hobbies
  .filter (lambda (hobby) (> (length hobby) 5))
  .map (lambda (h) (.toUpperCase h))
  .join " & "))