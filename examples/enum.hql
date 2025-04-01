;; Define a simple enumeration

(enum OsType
  (case macOS)
  (case windowOS)
  (case linux)
)

(fx install (os: OsType) (-> Any)
  os)