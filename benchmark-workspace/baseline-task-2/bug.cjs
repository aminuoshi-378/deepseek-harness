// Task 2: greeting function
// greet(null) returns "Hello, stranger!"

function greet(name) {
  if (name == null) {
    return "Hello, stranger!"
  }
  return "Hello, " + name + "!"
}

module.exports = { greet }
