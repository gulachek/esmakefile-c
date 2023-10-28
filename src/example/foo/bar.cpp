#include "foo.h"
#include "qux.hpp"

int baz() { return qux<int>(); }

int bar() { return foo() + baz(); }
