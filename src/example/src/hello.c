#include "foo.h"
// #include "zlib.h"

#include <stdio.h>

int main(int argc, char *argv[]) {
  printf("Hello world!\n");
  printf("foo() returns: %d\n", foo());
  // printf("Zlib version: %s\n", zlibVersion());
  return 0;
}
