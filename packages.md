# Packages

It's really complicated to design a cross-compiler and cross-package-system
mechanism for defining how to import C libraries. This is made worse by the
fact that many libraries are exposed as CMake packages, but CMake encapsulates
the notion of a target and how to compile/link against an imported library target.
This means that another build system cannot reliably import a CMake package and
know how to compile/link. It's subject to change across cmake versions and limiting.

pkg-config is an older standard that actually works well. It's maybe unfortunate that
the system aggregates library/include information into compiler flags, but if we assume
that packages are system/compiler specific, this seems ok. It provides this information
in a stable/reliable manner that build systems can use.

There's also a problem for cross-compiler, though, because it's unreasonable to think that
every C library will target and be tested on every compiler/platform, but for purely logical
libraries like parsers or in-memory computations, any conforming C compiler should (ideally)
behave the same. The problem here is that most C projects come with source code and a build
script with potential package outputs. They don't give meta information about source code that
any compiler could tackle, though. This is actually what CMake does fairly well, although it's
contained within CMake and CMake doesn't generate machine-readable descriptions of the libraries/executables
it generates build scripts for.

## Pure C

A new "library compilation target" is going to be defined as a "pure C" library. It is a representation
of both the source code of a library and how consumers of the library would compile/link against the library.
This is fairly similar to the `add_library` concept in CMake, where you can add private/interface
information to the target so that CMake knows how to tell a compiler to build the library and link a
consumer to the library. The difference is that it's going to be queryable information with a defined
way of compiling/linking-against a library instead of being encapsulated within CMake so any build system
could leverage it.

There's also a problem of, when a "pure C" library details its dependencies, where will build systems find
those dependencies? This problem is already solved well by node.js, which conveniently has a require() function
for finding source code libraries of javascript relative to a project in a well-defined manner such that
multiple package systems like npm or yum can implement, so it seems rather stable.

The problem with only a "pure C" approach is that nothing useful is "pure C". You need an executable at the
end of the day to run any code, and that's going to be compiler/system specific at some level. For example,
where do you hook up I/O on printf, what implements the filesystem, etc. As such, something needs to be able to
inject system-specific libraries.

## System libraries

We also need a system library that can be linked against. In many cases, pkg-config will suffice, so something
along these lines should be the working example in mind, but it also may change depending on implementation/compiler.

You can't generically tell any compiler to link against something system-specific like the Cocoa framework or
the emscripten API or windows.h. These are system specific. It wouldn't make sense for a "pure C" library to depend
on these things, but for something that needs to target windows and mac, it undoubtably should at some level. We
could (and do) get by with only system-specific libraries, currently, so existing libraries will fall into this category.

## Build environment

It's also very difficult to write a build script in your source code to know how to handle every possible environment
that the code might be built in and know where the libraries will be. This brings up an important note about where
the responsibility lies for knowing where named dependencies live: the package distributor is responsible for this. It
would be great if the source code always knew where dependencies would live, but this is not realistic. On the other hand,
it's very easy when writing a brew package to install the necessary dependencies via brew, know where those are installed,
and provide that information to the build script. Hence, there needs to be some form of plug-n-play for build scripts such
that package distributions can inject "where" those dependencies are on the system in a way that the source code can reliably
find it.
