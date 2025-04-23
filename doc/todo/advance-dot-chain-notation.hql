(fn wordFrequency (text)
  (let (words (text .toLowerCase .split " " .filter (lambda (w) (> (length w) 0))))
    (words
      .reduce (lambda (acc word)
        (if (acc .hasOwnProperty word)
          (do
            (set! (acc word) (+ (acc word) 1))
            acc)
          (do
            (set! (acc word) 1)
            acc)))
        {})))