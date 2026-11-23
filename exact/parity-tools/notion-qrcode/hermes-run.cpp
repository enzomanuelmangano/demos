// Runs a JavaScript file in the Hermes engine React Native 0.88 ships (hermes-engine
// 260318099.0.4, the macOS slice of the same pod the app links), with a global
// `print(string)` that writes a line to stdout. The RN app evaluates its JS (the JS thread and
// Reanimated's UI runtime) in this engine, so Array.prototype.sort, Math.* and Number#toString
// here are the app's.
//   ./build.sh && /tmp/notion-qrcode-hermes /tmp/notion-qrcode-parity.js
#include <hermes/hermes.h>
#include <jsi/jsi.h>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>

using namespace facebook;

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: %s file.js\n", argv[0]);
    return 1;
  }
  std::ifstream in(argv[1]);
  std::stringstream src;
  src << in.rdbuf();
  auto runtime = facebook::hermes::makeHermesRuntime();
  jsi::Runtime &rt = *runtime;
  rt.global().setProperty(
      rt, "print",
      jsi::Function::createFromHostFunction(
          rt, jsi::PropNameID::forAscii(rt, "print"), 1,
          [](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args, size_t count) {
            for (size_t i = 0; i < count; i++) {
              std::cout << args[i].toString(rt).utf8(rt) << (i + 1 < count ? " " : "");
            }
            std::cout << "\n";
            return jsi::Value::undefined();
          }));
  try {
    rt.evaluateJavaScript(std::make_shared<jsi::StringBuffer>(src.str()), argv[1]);
  } catch (const jsi::JSError &e) {
    fprintf(stderr, "%s\n%s\n", e.getMessage().c_str(), e.getStack().c_str());
    return 1;
  }
  return 0;
}
