;; test/data_structures.hql - Test for data structure literal syntax
;; Modified to avoid using set literals in JSON (which is not valid)

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

;; Set literals - kept separate from JSON
(def empty-set #[])
(def number-set #[1, 2, 3, 4, 5])
(def string-set #["apple", "orange", "banana"])

;; Complex mixed structure - no sets inside JSON
(def database {
  "users": [
    {
      "id": 1,
      "name": "Alice",
      "roles": ["admin", "user"]
    },
    {
      "id": 2,
      "name": "Bob",
      "roles": ["user"]
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

;; Store tags separately as sets
(def user1-tags #["javascript", "hql"])
(def user2-tags #["python", "rust"])

;; Print out all data structures to verify
(print "Empty vector:" empty-vector)
(print "Numbers vector:" numbers)
(print "Mixed vector:" mixed-vector)
(print "Empty map:" empty-map)
(print "User map:" user-map)
(print "Nested map:" nested-map)
(print "Empty set:" empty-set)
(print "Number set:" number-set)
(print "String set:" string-set)
(print "Database:" database)
(print "User 1 tags:" user1-tags)
(print "User 2 tags:" user2-tags)

;; Define a function that uses named parameters
(defn greet-user (name: String title: String)
  (str "Hello, " title " " name "!")
)

;; Call the function with named parameters
(print (greet-user name: "Smith" title: "Dr."))

;; Test more complex operations with maps and vectors
(def get-from-vector (get numbers 2))
(print "Element at index 2 of numbers:" get-from-vector)

(def get-from-map (get user-map "name"))
(print "Value of 'name' from user-map:" get-from-map)

;; Test function with named parameters working with data structures
(defn process-user (user-id: Number options: Object)
  (let [
    users (get database "users")
    user-index (- user-id 1)
    user (get users user-index)
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

;; For validation
(print "Test complete")