;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; main.hql - Comprehensive showcase of HQL features with complex imports
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 1: Module Imports (All supported formats)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Local HQL modules - different nesting levels
(def configMod (import "./config/main-config.hql"))
(def utilsMod (import "./utils/string-utils.hql"))
(def mathMod (import "./utils/math/operations.hql"))

;; Local JS modules that may import HQL
(def jsHelperMod (import "./helpers/js-helper.js"))
(def dateMod (import "./utils/date-formatter.js"))

;; Deno standard library imports
(def pathMod (import "https://deno.land/std@0.170.0/path/mod.ts"))
(def fsMod (import "https://deno.land/std@0.170.0/fs/mod.ts"))

;; JSR registry imports
(def jsr1 (import "jsr:@std/path@1.0.8"))
(def jsr2 (import "jsr:@std/fs@1.0.13"))

;; NPM modules
(def lodashMod (import "npm:lodash"))
(def momentMod (import "npm:moment"))

;; External URL modules
(def chalkMod (import "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js"))

;; Add a crypto import so (crypto.randomUUID) works:
(def crypto (import "node:crypto"))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 2: Constants & Data Structures
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Vector (array) declaration
(def supportedFormats (vector "json" "xml" "yaml" "csv" "text"))
(def numericValues (vector 10 20 30 40 50))

;; Hash map (object) declaration
(def defaultSettings (hash-map 
  (keyword "timeout") 30000
  (keyword "retries") 3
  (keyword "verbose") false
  (keyword "format") (get supportedFormats 0)
))

;; List construction
(def itemsList (list "apple" "banana" "cherry" "date"))

;; JavaScript object construction
(def currentDate (new Date))
(def mySet (new Set (list 1 2 3 3 4 5 5))) ;; Duplicates automatically removed

;; Enum definition
(defenum LogLevel debug info warn error critical)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 3: Function Definitions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Basic function
(defn greet (name)
  (str "Hello, " name "!")
)

;; Function with type annotations and return type
(defn calculateArea (width: Number height: Number) (-> Number)
  (* width height)
)

;; Function with named parameters
(defn formatUser (first: String last: String title: String)
  (str title " " first " " last)
)

;; Function using imported modules
(defn processPath (filePath)
  (let [
    dirName (pathMod.dirname filePath)
    baseName (pathMod.basename filePath)
    extension (pathMod.extname filePath)
    exists (fsMod.existsSync filePath)
  ]
    (hash-map
      (keyword "dir") dirName
      (keyword "base") baseName
      (keyword "ext") extension
      (keyword "exists") exists
      (keyword "formatted") (jsHelperMod.formatPathInfo dirName baseName extension)
    )
  )
)

;; Function with conditional logic
(defn classifyNumber (num)
  (cond
    (< num 0) "negative"
    (= num 0) "zero"
    (> num 0) "positive"
    true "unknown" ;; Default case
  )
)

;; Anonymous function
(def multiply (fn (a b) (* a b)))

;; Higher-order function
(defn makeAdder (n)
  (fn (x) (+ x n))
)
(def addFive (makeAdder 5))

;; Function that uses various module imports
(defn generateReport (data format)
  (let [
    timestamp (dateMod.formatCurrentDate "yyyy-MM-dd HH:mm:ss")
    id (crypto.randomUUID)
    upperName (lodashMod.upperCase (get data "name"))
    formattedData (utilsMod.formatData data format)
    config (configMod.getConfig format)
    mathResult (mathMod.calculate (get data "value") 10)
  ]
    (hash-map
      (keyword "id") id
      (keyword "timestamp") timestamp
      (keyword "name") upperName
      (keyword "data") formattedData
      (keyword "config") config
      (keyword "calculation") mathResult
    )
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 4: Using External Modules
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Use chalk for colored output
(defn coloredLog (message level)
  (cond
    (= level LogLevel.debug) ((get chalkMod "blue") message)
    (= level LogLevel.info) ((get chalkMod "green") message)
    (= level LogLevel.warn) ((get chalkMod "yellow") message)
    (= level LogLevel.error) ((get chalkMod "red") message)
    (= level LogLevel.critical) ((get chalkMod "bgRed") ((get chalkMod "white") message))
    true message
  )
)

;; Use lodash utilities
(defn processCollection (items)
  (let [
    chunked (lodashMod.chunk items 2)
    shuffled (lodashMod.shuffle items)
    first (lodashMod.first items)
    last (lodashMod.last items)
  ]
    (hash-map
      (keyword "chunked") chunked
      (keyword "shuffled") shuffled
      (keyword "first") first
      (keyword "last") last
    )
  )
)

;; Use moment for date formatting
(defn formatTimeAgo (dateString)
  (momentMod.fromNow dateString)
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 5: Arithmetic & Operations
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Basic arithmetic
(defn mathDemo (a b)
  (hash-map
    (keyword "add") (+ a b)
    (keyword "subtract") (- a b)
    (keyword "multiply") (* a b)
    (keyword "divide") (/ a b)
    (keyword "complex") (+ (* a b) (/ a b))
  )
)

;; String operations using the str function
(defn stringDemo (a b)
  (hash-map
    (keyword "concat") (str a b)
    (keyword "with-space") (str a " " b)
    (keyword "repeated") (str a a a)
    (keyword "with-number") (str a " #" b)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 6: Main Demo Functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn runDemo ()
  (let [
    userName "Alice Smith"
    userSettings (hash-map 
      (keyword "name") userName
      (keyword "path") "./data/user.json"
      (keyword "value") 42
      (keyword "items") itemsList
    )
    processedPath (processPath (get userSettings "path"))
    report (generateReport userSettings "json")
    infoMessage (str "Generated report for " userName)
    errorMessage (str "Failed to save report " (get report "id"))
  ]
    (print (coloredLog "Starting demo" LogLevel.info))
    (print (coloredLog infoMessage LogLevel.info))
    (print (coloredLog errorMessage LogLevel.error))
    
    (print "Path info:" processedPath)
    (print "Report:" report)
    (print "Math demo:" (mathDemo 10 5))
    (print "String demo:" (stringDemo "Hello" "World"))
    (print "Collection demo:" (processCollection itemsList))
    
    (print "Add 5 to 10:" (addFive 10))
    (print "Classify -5:" (classifyNumber -5))
    (print "Classify 0:" (classifyNumber 0))
    (print "Classify 5:" (classifyNumber 5))
    
    (print "Area of 10x20 rectangle:" (calculateArea width: 10 height: 20))
    (print "Formatted user:" (formatUser first: "John" last: "Doe" title: "Dr."))
    
    (print (coloredLog "Demo completed" LogLevel.info))
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 7: Execute Demo
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(print "=== HQL Comprehensive Demo ===")
(runDemo)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 8: Module Exports
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(export "greet" greet)
(export "calculateArea" calculateArea)
(export "formatUser" formatUser)
(export "processPath" processPath)
(export "classifyNumber" classifyNumber)
(export "generateReport" generateReport)
(export "coloredLog" coloredLog)
(export "processCollection" processCollection)
(export "mathDemo" mathDemo)
(export "stringDemo" stringDemo)
(export "runDemo" runDemo)
(export "supportedFormats" supportedFormats)
(export "defaultSettings" defaultSettings)
