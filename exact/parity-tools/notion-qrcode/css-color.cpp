// RN Skia's Skia.Color(string) then paint.setColor(color), on stdin's lines (one CSS colour
// each): react-native-skia 3.7.2's own CSSColorParser (cpp/api/third_party), JsiSkColor's
// toValue (SkColorSetARGB(a * 255, r, g, b), then SkColor4f::FromColor's bytes x (1 / 255.0f)
// into the Float32Array) and fromValue (SkColorSetARGB(c[3] * 255, c[0] * 255, ...): float to
// U8CPU, truncated). Prints each line's final r g b a bytes, then an FNV-1a (32-bit) over them.
//   clang++ -std=c++17 -I<skia>/cpp/api/third_party css-color.cpp <skia>/cpp/api/third_party/CSSColorParser.cpp
#include "CSSColorParser.h"
#include <cstdint>
#include <cstdio>
#include <iostream>
#include <string>

typedef unsigned U8CPU;
static uint32_t SkColorSetARGB(U8CPU a, U8CPU r, U8CPU g, U8CPU b) {
  return (a << 24) | (r << 16) | (g << 8) | (b << 0);
}

int main() {
  std::string line;
  uint32_t h = 0x811c9dc5;
  int n = 0;
  while (std::getline(std::cin, line)) {
    auto c = CSSColorParser::parse(line);
    uint32_t argb = SkColorSetARGB(c.a * 255, c.r, c.g, c.b);
    float f[4];
    const uint8_t bgra[4] = {uint8_t(argb), uint8_t(argb >> 8), uint8_t(argb >> 16), uint8_t(argb >> 24)};
    f[0] = float(bgra[2]) * (1 / 255.0f);
    f[1] = float(bgra[1]) * (1 / 255.0f);
    f[2] = float(bgra[0]) * (1 / 255.0f);
    f[3] = float(bgra[3]) * (1 / 255.0f);
    uint32_t out = SkColorSetARGB(f[3] * 255, f[0] * 255, f[1] * 255, f[2] * 255);
    uint8_t b[4] = {uint8_t(out >> 16), uint8_t(out >> 8), uint8_t(out), uint8_t(out >> 24)};
    printf("%u %u %u %u %s\n", b[0], b[1], b[2], b[3], line.c_str());
    for (int i = 0; i < 4; i++) {
      h ^= b[i];
      h *= 0x01000193;
    }
    n++;
  }
  printf("colors %08x n=%d\n", h, n);
  return 0;
}
