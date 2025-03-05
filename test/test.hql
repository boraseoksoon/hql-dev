;; test/test.hql

(defn average (nums)
  (let [
    sum (reduce nums (fn (acc val) (+ acc val)) 0)
    count nums.length
  ]
    (/ sum count)
  )
)

(log [1, 2, 3, 4, 5])
(log (average [1,2,3,4,5]))