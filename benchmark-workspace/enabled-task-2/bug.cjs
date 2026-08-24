// Task 2: Fix the null check in the greeting function
// greet(null) should return "Hello, stranger!"

function greet(name) {
  if (name == null) {
    return "Hello, stranger!"
  }
  return "Hello, " + name + "!"
}

module.exports = { greet }
