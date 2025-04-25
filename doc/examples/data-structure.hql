;; Test property access vs function call behavior
;; This shows how (obj "key") will prioritize property access over function calls

;; Define an object with properties
(var person { 
  "name": "John", 
  "age": 30, 
  "hobbies": ["coding", "reading", "hiking"] 
})

(print (person "hobbies"))
(print (person.hobbies))
(print (get person "hobbies"))

;; Define a function
(fn get-hobby (key)
  (str "Finding hobby: " key))

;; Access property using the new pattern
(print "Object property access:")
(print (person "hobbies"))

;; Call function using the same pattern
(print "\nFunction call:")
(print (get-hobby "reading"))

;; Function with property
(fn get-data (id)
  (str "Getting data for ID: " id))

;; Add a property to the function
(set! get-data.version "1.0")

;; Access function property (will prioritize property over calling the function)
(print "\nFunction property access:")
(print (get-data "version"))

;; Call the function normally
(print "\nNormal function call:")
(print (get-data "123"))

;; Using standard get function as a reference
(print "\nUsing standard get function:")
(print (get person "hobbies"))
