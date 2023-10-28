#ifndef FOO_H
#define FOO_H

#include "foo_api.h"

#ifdef __cplusplus
extern "C" {
#endif

FOO_API int foo();
FOO_API int bar();

#ifdef __cplusplus
}
#endif

#endif
