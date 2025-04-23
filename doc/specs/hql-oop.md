# HQL's Object-Oriented Programming Features

## Everything is an Object in HQL

In HQL, all values—including primitives like strings, numbers, and booleans—behave like objects. This is achieved by leveraging JavaScript's automatic boxing of primitive values, allowing method calls on any value.

### Primitive Values as Objects

```lisp
;; String methods
(print ("hello world" .toLowerCase .split " " .join "-"))
;; => "hello-world"

;; Number methods
(print (123.456 .toFixed 2))
;; => "123.46"

;; Boolean methods
(print (false .toString .toUpperCase))
;; => "FALSE"
```

### Collections as Objects

```lisp
;; Array methods
(print ([1, 2, 3, 4, 5]
  .filter (lambda (n) (= (% n 2) 0))
  .map (lambda (n) (* n 2))))
;; => [4, 8]

;; Object methods
(print (Object.keys person .map (lambda (key) (.toUpperCase key))))
;; => ["NAME", "AGE", "ADDRESS"]
```

## Benefits of OOP in HQL

### 1. Method Chaining for Complex Operations

Method chaining allows for elegant composition of operations:

```lisp
;; Process text in a single expression
(print (text
  .trim
  .toLowerCase
  .replace "quick" "clever"
  .split " "
  .filter (lambda (word) (> (length word) 3))
  .map (lambda (word) (.toUpperCase word))
  .join "_"))
;; => "CLEVER_BROWN_JUMPS_OVER_LAZY"
```

### 2. Working with Collections

Object-oriented programming shines when working with collections:

```lisp
;; Group and summarize data
(print (users
  .filter (lambda (user) (user .isActive))
  .groupBy (lambda (user) (user .department))
  .map (lambda (group) {
    "department": (group .key),
    "count": (group .value .length),
    "avgAge": (/ ((group .value .map (lambda (u) (u .age))) .reduce (lambda (a b) (+ a b)) 0)
              (group .value .length)),
    "names": ((group .value .map (lambda (u) (u .name))) .join ", ")
  })))
```

### 3. Custom Classes and Methods

HQL supports defining custom classes with methods for domain-specific functionality:

```lisp
;; Define a custom class
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

;; Use the class and its methods
(var p1 (new Point 3 4))
(var p2 (new Point 6 8))

(print (p1 .toString))                ;; => "Point(3, 4)"
(print (p1 .distanceTo p2))           ;; => 5
```

## Behind the Scenes: JavaScript's Object Model

HQL's object-oriented features leverage JavaScript's object model:

1. **Property Access**: When accessing properties like `object.property`, HQL generates code that accesses the property directly.

2. **Method Calls**: When calling methods like `object.method(args)`, HQL generates code that calls the method with the correct `this` binding.

3. **Primitive Boxing**: When calling methods on primitives, JavaScript automatically "boxes" the primitive value into a temporary object.

### Example: String Processing Internals

Consider this HQL expression:

```lisp
(text .trim .toUpperCase .split " ")
```

The generated JavaScript looks similar to:

```javascript
(() => {
  const _obj = text;
  
  // Handle .trim - could be property or method
  const _prop1 = _obj.trim;
  const _result1 = typeof _prop1 === "function" ? _prop1.call(_obj) : _prop1;
  
  // Handle .toUpperCase - could be property or method
  const _prop2 = _result1.toUpperCase;
  const _result2 = typeof _prop2 === "function" ? _prop2.call(_result1) : _prop2;
  
  // Handle .split with argument
  return _result2.split(" ");
})();
```

This demonstrates how HQL bridges functional and object-oriented paradigms by generating JavaScript that preserves the semantics of both approaches.

## Practical Applications

### Data Processing Pipeline

```lisp
(fn processOrders (orders)
  (orders
    .filter (lambda (order) (order .isActive))
    .map (lambda (order) {
      "id": (order .id),
      "total": (order .items .reduce (lambda (sum item) (+ sum (item .price))) 0),
      "date": (order .date .toLocaleDateString),
      "customer": (order .customer .name)
    })
    .sort (lambda (a b) (- (b .total) (a .total)))
    .slice 0 10))
```

### UI Component Event Handling

```lisp
(button
  .addEventListener "click" (lambda (event)
    (event .preventDefault)
    (form .validate)
    (form .submit)
    ((event .target) .setAttribute "disabled" "disabled")))
```

By combining functional programming with object-oriented features, HQL provides a powerful, expressive language for modern application development.