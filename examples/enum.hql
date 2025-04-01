;; Define a simple enumeration
(enum OsType
  (case macOS)
  (case windowOS)
  (case linux)
)

;; Define an enum with specified Raw Values (e.g., Int)
(enum StatusCodes: Int
  (case ok 200)
  (case notFound 404)
  (case serverError 500)
)

;; Define an enum with Associated Values (using named parameters)
(enum Barcode
  (case upc system: Int manufacturer: Int product: Int check: Int)
  (case qrCode value: String)
)

;; Example usage
(fx testEnums (currentOS: OsType = OsType.macOS) (-> String)
  (let status StatusCodes.ok)
  (let code (Barcode.qrCode value: "hello-world"))
  
  ;; Pattern matching simulation with conditionals
  (if (= currentOS OsType.linux)
    "Running on Linux!"
    (if (= currentOS OsType.macOS)
      "Running on macOS!"
      "Running on Windows!"))
)

;; Export the test function
(export testEnums)