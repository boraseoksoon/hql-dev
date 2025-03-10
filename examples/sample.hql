;; (numbers.filter (fn (n) (> n 5))).length

[1, 2, 3, 4, 5]     ;; vector
#[1, 2, 3, 4, 5]    ;; set
{ "key" : "value" } ;; map
'(1 2, 3, 4, 5)     ;; list

(def json { items : [1, 2, 3, 4, 5] })

(json.items)

(def data {
  "items": [5, 10, 15, 20, 25, 30, 35, 40],
  "factor": 2,
  "prefix": "Value: "
})

(data.items)
