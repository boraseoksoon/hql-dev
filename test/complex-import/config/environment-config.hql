;; test/complex-import/config/environment-config.hql

;; Define environment constants
(def environments (vector "development" "testing" "staging" "production"))
(def defaultEnvironment (get environments 0))

;; Get current environment from environment variable or default
(defn getCurrentEnvironment ()
  (let [
    envVar (js/Deno.env.get "APP_ENV")
  ]
    (cond
      (= envVar "development") (get environments 0)
      (= envVar "testing") (get environments 1)
      (= envVar "staging") (get environments 2)
      (= envVar "production") (get environments 3)
      true defaultEnvironment
    )
  )
)

;; Get environment configuration
(defn getEnvironmentConfig ()
  (let [
    currentEnv (getCurrentEnvironment)
  ]
    (cond
      (= currentEnv (get environments 0)) (hash-map
        (keyword "debug") true
        (keyword "logLevel") "debug"
        (keyword "apiBase") "http://localhost:3000"
      )
      (= currentEnv (get environments 1)) (hash-map
        (keyword "debug") true
        (keyword "logLevel") "info"
        (keyword "apiBase") "http://test-api.example.com"
      )
      (= currentEnv (get environments 2)) (hash-map
        (keyword "debug") false
        (keyword "logLevel") "warn"
        (keyword "apiBase") "https://staging-api.example.com"
      )
      (= currentEnv (get environments 3)) (hash-map
        (keyword "debug") false
        (keyword "logLevel") "error"
        (keyword "apiBase") "https://api.example.com"
      )
      true (hash-map
        (keyword "debug") true
        (keyword "logLevel") "debug"
        (keyword "apiBase") "http://localhost:3000"
      )
    )
  )
)

;; Export functions
(export "getCurrentEnvironment" getCurrentEnvironment)
(export "getEnvironmentConfig" getEnvironmentConfig)
(export "environments" environments)
(export "defaultEnvironment" defaultEnvironment)