#ifndef FOO_API_H
#define FOO_API_H

#ifdef EXPORT_FOO_API
#define FOO_API EXPORT
#else
#define FOO_API IMPORT
#endif

#endif
