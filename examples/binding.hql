(let (x 10
        y 20
        z (+ x y))
    (print "Multiple bindings test:")
    (print "x =" x)
    (print "y =" y)
    (print "z =" z)
    (print "x + y + z =" (+ x (+ y z))))