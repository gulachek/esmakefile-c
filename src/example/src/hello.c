#include "foo.h"
#include "sqlite3.h"
#include "zlib.h"
#include <CoreGraphics/CoreGraphics.h>

#include <stdio.h>

#ifndef FOO_TEST_MACRO
#error FOO_TEST_MACRO not exported properly
#endif

#ifdef EXPORT_FOO_API
#error EXPORT_FOO_API should be private definition
#endif

int main(int argc, char *argv[]) {
#ifdef DEBUG
  printf("DEBUG is defined\n");
#endif
#ifdef NDEBUG
  printf("NDEBUG is defined\n");
#endif

  printf("Hello world!\n");
  printf("foo() returns: %d\n", foo());
  printf("bar() returns: %d\n", bar());
  printf("Zlib version: %s\n", zlibVersion());
  printf("sqlite3 version: %s\n", sqlite3_libversion());

  CFArrayRef arr = CGWindowListCreate(kCGWindowListOptionAll, kCGNullWindowID);
  CFIndex len = CFArrayGetCount(arr);
  printf("There are %lu windows", len);
  CFRelease(arr);
  return 0;
}
