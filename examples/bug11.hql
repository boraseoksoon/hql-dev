;; Function that demonstrates deep copying of parameters - FIXED
(fx increment-counters (obj: Any) (-> Any)
  ;; Make sure obj is not null or undefined 
  (if (eq? obj null)
      ;; Return a default object if input is null
      (return {"count": 1})
      ;; Process the object with explicit return
      (let (
        ;; Create a new object with the updated count
        newObj (js-call Object "assign" (js-call Object "create" {}) obj)
        ;; Get the current count or default to 0 if not present
        currentCount (if (js-call Object "hasOwnProperty" obj "count")
                        (js-get obj "count")
                        0)
      )
        ;; Set the new count
        (js-set newObj "count" (+ currentCount 1))
        ;; Explicitly return the new object
        (return newObj))))

 ;; Test object mutation/copying
  test12 (increment-counters {"count": 5})  ;; {"count": 6}
  
  ;; Test null handling
  test13 (increment-counters null)  ;; {"count": 1}

(print "Test 12 (increment-counters):" test12)
(print "Test 13 (increment-counters with null):" test13)