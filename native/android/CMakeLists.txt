cmake_minimum_required(VERSION 3.13)
project(DemosNitro)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(NATIVE_ROOT ${CMAKE_SOURCE_DIR}/../..)

add_definitions(-DBUILDING_DEMOSNITRO_WITH_GENERATED_CMAKE_PROJECT)

add_library(DemosNitro SHARED
    ${NATIVE_ROOT}/src/native/ColorMatcher/HybridColorMatcher.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/cpp-adapter.cpp
    ${NATIVE_ROOT}/nitrogen/generated/android/DemosNitroOnLoad.cpp
    ${NATIVE_ROOT}/nitrogen/generated/shared/c++/HybridColorMatcherSpec.cpp
)

target_include_directories(DemosNitro PRIVATE
    ${NATIVE_ROOT}/src/native/ColorMatcher
    ${NATIVE_ROOT}/nitrogen/generated/shared/c++
    ${NATIVE_ROOT}/nitrogen/generated/android/c++
    ${NATIVE_ROOT}/nitrogen/generated/android
)

find_package(fbjni REQUIRED)
find_package(ReactAndroid REQUIRED)
find_package(react-native-nitro-modules REQUIRED)

target_link_libraries(DemosNitro
    fbjni::fbjni
    ReactAndroid::jsi
    react-native-nitro-modules::NitroModules
)

if(ReactAndroid_VERSION_MINOR GREATER_EQUAL 76)
    target_link_libraries(DemosNitro ReactAndroid::reactnative)
else()
    target_link_libraries(DemosNitro ReactAndroid::react_nativemodule_core)
endif()
