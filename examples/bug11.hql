;; look up
(let user2 {"name": "Alice", "status": "active"})
(print (get user2 "name"))  ; returns "Alice"
(print user2.name)  ; also returns "Alice"