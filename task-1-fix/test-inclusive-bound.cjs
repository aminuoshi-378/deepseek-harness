// Regression tests for the off-by-one bug: range(n) must return 1..n inclusive.
// The minimal cases target each end of the loop bound:
// - range(1) catches a dropped upper bound (`i < n` returns [])
// - range(5) length/last element catch an exclusive or 0-based loop
const { range } = require('./bug.cjs')

let failed = false

function check(label, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    console.error(`FAIL: ${label} returned ${a}, expected ${e}`)
    failed = true
  } else {
    console.log(`PASS: ${label} returns ${e}`)
  }
}

check('range(1)', range(1), [1])
check('range(5)', range(5), [1, 2, 3, 4, 5])
check('range(0)', range(0), [])

const r = range(100)
check('range(100) first element', r[0], 1)
check('range(100) last element (inclusive upper bound)', r[99], 100)
check('range(100) length', r.length, 100)

if (failed) process.exit(1)
