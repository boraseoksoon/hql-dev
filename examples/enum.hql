(enum OsType
  (case macOS)
  (case windowOS)
  (case linux)
)

;; Define an enum with raw values
(enum StatusCodes:Int
  (case ok 200)
  (case notFound 404)
  (case serverError 500)
)

;; Define an enum with associated values
(enum Shape
  (case circle radius: Double)
  (case rectangle width: Double height: Double)
  (case triangle a: Double b: Double c: Double)
)

(let os OsType.macOS)
(print os)