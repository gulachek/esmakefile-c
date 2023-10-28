#include "foo.h"

int baz() { return 3; }

int bar() { return foo() + baz(); }
