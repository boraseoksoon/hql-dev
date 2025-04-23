;; hql-dot-notation-showcase.hql
;; A comprehensive demonstration of HQL's dot notation and OOP capabilities

;; Set up some test data
(var text "   The quick brown fox jumps over the lazy dog   ")
(var numbers [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
(var person {
  "name": "John Smith",
  "age": 35,
  "address": {
    "street": "123 Main St",
    "city": "Anytown",
    "country": "USA"
  },
  "hobbies": ["coding", "reading", "hiking", "photography"]
})

(print "========== BASIC DOT NOTATION ==========")

;; Basic property access
(print "Person's name: " (person .name))

;; Method calls with arguments
(print "First three hobbies: " ((person .hobbies) .slice 0 3))

;; Method calls without arguments
(print "Trimmed text: " (text .trim))

(print "\n========== PRIMITIVE VALUES AS OBJECTS ==========")

;; String methods
(print "String upper case: " ("hello world" .toUpperCase))
(print "String split: " ("a,b,c,d" .split ","))

;; Number methods
(print "Number fixed: " (123.456789 .toFixed 2))
(print "Number as exponential: " (1234 .toExponential))

;; Boolean methods
(print "Boolean as string: " (true .toString))

(print "\n========== METHOD CHAINING ==========")

;; Simple chain
(print "Trimmed and uppercase text: " 
  (text .trim .toUpperCase))

;; Complex chain with various operations
(print "Complex text transformation: " 
  (text
    .trim
    .toLowerCase
    .replace "quick" "clever"
    .split " "
    .filter (lambda (word) (> (length word) 3))
    .map (lambda (word) (.toUpperCase word))
    .join "_"))

;; Array transformation chain
(print "Number transformation: " 
  (numbers
    .filter (lambda (n) (= (% n 20) 0))
    .map (lambda (n) (* n 2))
    .reduce (lambda (acc curr) (+ acc curr)) 0))

(print "\n========== NESTED OBJECT ACCESS ==========")

;; Access nested properties
(print "Nested property access: " (person .address .city))

;; Chain on nested property
(print "Person's country uppercase: " ((person .address .country) .toUpperCase))

;; Access array within object and transform
(print "Uppercase hobbies: " 
  ((person .hobbies)
    .map (lambda (hobby) (.toUpperCase hobby))
    .join ", "))

(print "\n========== CLASS DEFINITION AND USAGE ==========")

;; Define a Point class
(class Point
  (var x 0)
  (var y 0)
  
  (constructor (x y)
    (set! self.x x)
    (set! self.y y))
  
  (fn distanceTo (otherPoint)
    (let (dx (- otherPoint.x self.x)
          dy (- otherPoint.y self.y))
      (Math.sqrt (+ (* dx dx) (* dy dy)))))
  
  (fn toString ()
    (+ "Point(" self.x ", " self.y ")")))

;; Create instances and use methods
(var p1 (new Point 3 4))
(var p2 (new Point 6 8))

(print "Point 1: " (p1 .toString))
(print "Point 2: " (p2 .toString))
(print "Distance between points: " (p1 .distanceTo p2))

(print "\n========== DATA PROCESSING EXAMPLE ==========")

;; Sample data for processing
(var orders [
  { 
    "id": "ORD-001", 
    "isActive": true,
    "date": (new Date "2023-01-15"),
    "customer": { "name": "Alice Johnson", "id": "C001" },
    "items": [
      { "name": "Laptop", "price": 1200 },
      { "name": "Mouse", "price": 25 }
    ]
  },
  { 
    "id": "ORD-002", 
    "isActive": true,
    "date": (new Date "2023-02-20"),
    "customer": { "name": "Bob Smith", "id": "C002" },
    "items": [
      { "name": "Monitor", "price": 300 },
      { "name": "Keyboard", "price": 50 },
      { "name": "Speakers", "price": 80 }
    ]
  },
  { 
    "id": "ORD-003", 
    "isActive": false,
    "date": (new Date "2023-03-10"),
    "customer": { "name": "Charlie Davis", "id": "C003" },
    "items": [
      { "name": "Headphones", "price": 150 }
    ]
  }
])

;; Process the orders data
(fn processOrders (orders)
  (orders
    .filter (lambda (order) (order .isActive))
    .map (lambda (order) {
      "id": (order .id),
      "total": (order .items .reduce (lambda (sum item) (+ sum (item .price))) 0),
      "date": ((order .date) .toDateString),
      "customer": (order .customer .name)
    })
    .sort (lambda (a b) (- (b .total) (a .total)))))

(print "Processed orders: " (processOrders orders))

(print "\n========== ADVANCED TEXT PROCESSING ==========")

;; Define sample text for processing
(var article "HQL is a powerful programming language. It combines functional programming with object-oriented features. Developers can use HQL to build modern applications.")


(print "\n========== END OF SHOWCASE ==========")