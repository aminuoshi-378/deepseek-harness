// Task 5: Fix the string reversal that breaks on multi-char Unicode
// reverse("abc😀def") should return "fed😀cba"
// Array.from() iterates by code point, so surrogate pairs stay intact

function reverse(str) {
  return Array.from(str).reverse().join('')
}

module.exports = { reverse }
