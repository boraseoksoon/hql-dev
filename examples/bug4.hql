(def numbers [1,2,3,4,5,6,7,8,9,10])
(def vec-item (get numbers 2))
(print vec-item)


(def user2 {"name": "Alice", "status": "active"})
(print (get user2 "name"))  ; returns "Alice"