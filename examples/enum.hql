;; Define a simple enumeration

(enum OsType
  (case macOS)
  (case windowOS)
  (case linux)
)

(let os OsType.macOS)

(fn install (os)
 os)

(print (install os: OsType.macOS))
