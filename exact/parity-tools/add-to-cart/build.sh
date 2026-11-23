#!/bin/sh
# Builds yoga-layout.cpp against React Native's Yoga: /tmp/add-to-cart-yoga.
set -e
here=$(cd "$(dirname "$0")" && pwd)
yoga="$here/../../../node_modules/react-native/ReactCommon/yoga"
clang++ -std=c++20 -O1 -I"$yoga" $(find "$yoga/yoga" -name '*.cpp') "$here/yoga-layout.cpp" -o /tmp/add-to-cart-yoga
