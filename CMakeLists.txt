cmake_minimum_required(VERSION 3.8)
project(test)

find_package(ZLIB REQUIRED)

get_target_property(Loc ZLIB::ZLIB IMPORTED_LOCATION_RELEASE)
message(Loc: ${Loc})
