// Task 3: Fix the duplicate removal logic
// removeDuplicates should return unique values preserving order

function removeDuplicates(arr) {
  const seen = {}
  return arr.filter(item => {
    if (seen[item]) {
      return false
    }
    seen[item] = true
    return true
  })
}

module.exports = { removeDuplicates }
