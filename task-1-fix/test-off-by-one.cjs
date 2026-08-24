// Regression test for the range() off-by-one bug.
// The buggy loop (`for (let i = 1; i < n; i++)`) drops the upper bound and
// returns 1..n-1; these cases pin the inclusive contract 1..n.
// - range(1) catches the bug at its smallest input: the buggy loop returns []
// - range(2) is the smallest input where an element goes missing
// - length/last-element checks catch the exclusive loop for larger n
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
check('range(2)', range(2), [1, 2])

for (const n of [3, 7, 50]) {
  const r = range(n)
  check(`range(${n}) length`, r.length, n)
  check(`range(${n}) last element is ${n}`, r[r.length - 1], n)
}

if (failed) process.exit(1)
