(import path "https://deno.land/std@0.170.0/path/mod.ts")
(def joined-path (path.join "folder" "file.txt"))

(import file "https://deno.land/std@0.170.0/fs/mod.ts")
(def exists (file.existsSync "example-dir"))

(print "hello")
(console.log exists)