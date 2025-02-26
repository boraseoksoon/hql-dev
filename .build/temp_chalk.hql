;; chalk.hql
(def chalk (import "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js"))
(defn sayHello ()
  ((get chalk "blue") "Hello from JS")
)
(export "sayHello" sayHello)
