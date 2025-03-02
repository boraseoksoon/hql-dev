;; complex_data_structures.hql - Demonstrating complex nested data structures
;; Compatible version that shows both JSON syntax and named parameters

;; Import utility libraries
(def lodash (import "https://esm.sh/lodash"))
(def pathMod (import "https://deno.land/std@0.170.0/path/mod.ts"))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 1: Basic Data Structure Literals
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Vector literals
(def empty-vector [])
(def numbers [1, 2, 3, 4, 5])
(def mixed-vector [1, "two", true, null])

;; Map literals with JSON syntax
(def empty-map {})
(def user-map {"name": "Alice", "age": 30, "active": true})
(def nested-map {
  "user": {
    "name": "Bob", 
    "contact": {
      "email": "bob@example.com"
    }
  }
})

;; Set literals
(def empty-set #[])
(def number-set #[1, 2, 3, 4, 5])
(def string-set #["apple", "orange", "banana"])

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 2: Named Parameter Functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Define a function that uses named parameters
(defn greet-user (name: String title: String)
  (str "Hello, " title " " name "!")
)

;; Call the function with named parameters (preserving original syntax)
(print (greet-user name: "Smith" title: "Dr."))

;; Define a function with multiple parameters
(defn calculate-price (base: Number tax-rate: Number quantity: Number)
  (let [
    subtotal (* base quantity)
    tax (* subtotal (/ tax-rate 100))
  ]
    (+ subtotal tax)
  )
)

;; Call the function with named parameters
(print "Total price:" (calculate-price 
  base: 19.99
  tax-rate: 8.5
  quantity: 3
))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 3: Complex Data Example
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Complex mixed structure with JSON syntax and various data structures
(def database {
  "users": [
    {
      "id": 1,
      "name": "Alice",
      "roles": ["admin", "user"],
      "tags": #["javascript", "hql"]
    },
    {
      "id": 2,
      "name": "Bob",
      "roles": ["user"],
      "tags": #["python", "rust"] 
    }
  ],
  "settings": {
    "version": "1.0.0",
    "features": {
      "enabled": true,
      "list": ["search", "comments"]
    }
  }
})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 4: Mixed Operations
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Helper function to safely get a nested property
(defn get-in [obj path default-value]
  (reduce 
    (fn [current key] 
      (if (and current (not (= current null)))
        (get current key)
        null))
    obj
    path)
)

;; Process data with both JSON syntax and named parameters
(defn process-user (user-id: Number options: Object)
  (let [
    user-index (- user-id 1)
    user (get-in database ["users", user-index] null)
    settings (get database "settings")
  ]
    (if (= user null)
      {"error": "User not found"}
      {"user": {
        "name": (get user "name"),
        "roles": (get user "roles"),
        "options": options
      }}
    )
  )
)

;; Call with named parameters and create JSON objects
(print "User data:" (process-user 
  user-id: 1 
  options: {"detailed": true, "includeInactive": false}
))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 5: Export
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(export "greetUser" greet-user)
(export "calculatePrice" calculate-price)
(export "database" database)
(export "processUser" process-user)