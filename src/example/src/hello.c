#include "foo.h"
#include "sqlite3.h"
#include "zlib.h"
#include <CoreGraphics/CoreGraphics.h>

#include <stdio.h>

int main(int argc, char *argv[]) {
  printf("Hello world!\n");
  printf("foo() returns: %d\n", foo());
  printf("Zlib version: %s\n", zlibVersion());
  printf("sqlite3 version: %s\n", sqlite3_libversion());

  CFArrayRef arr = CGWindowListCreate(kCGWindowListOptionAll, kCGNullWindowID);
  CFIndex len = CFArrayGetCount(arr);
  printf("There are %lu windows", len);
  CFRelease(arr);
  return 0;
}
