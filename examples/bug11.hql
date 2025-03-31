(var text "   The quick brown fox jumps over the lazy dog   ")
(print (text
  .trim
  .toUpperCase
  .split " "))