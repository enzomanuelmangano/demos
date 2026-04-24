#include <jni.h>
#include <fbjni/fbjni.h>
#include "DemosNitroOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
    return facebook::jni::initialize(vm, []() {
        // Register all DemosNitro HybridObjects
        margelo::nitro::demos::registerAllNatives();
    });
}
