;; examples/test-join.hql

;; Define three simple lists.
(def list1 '(1 2 3))
(def list2 '(4 5 6))
(def list3 '(7 8 9))

;; Use the join-lists macro to combine them.
(def joined (join-lists list1 list2 list3))

;; Print the joined list.
(js-call console "log" "Joined list:" joined)
