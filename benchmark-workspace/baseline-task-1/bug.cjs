// Task 1: Fix the off-by-one error in the range function
// The function should return numbers from 1 to n (inclusive)
// Returns 1 to n inclusive

function range(n) {
  const result = []
  for (let i = 1; i <= n; i++) {
    result.push(i)
  }
  return result
}

module.exports = { range }
