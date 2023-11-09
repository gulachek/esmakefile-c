#include "foo.h"
#include "pch.hpp"
#include "qux.hpp"

int baz() {
  std::cout << "running baz" << std::endl;
  return qux<int>();
}

int bar() { return foo() + baz(); }
