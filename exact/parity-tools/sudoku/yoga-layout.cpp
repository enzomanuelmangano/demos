// The sudoku demo's view tree (src/animations/sudoku) laid out by React Native 0.88's own Yoga
// (node_modules/react-native/ReactCommon/yoga), with RN Fabric's config: YGErrataAll, the
// device's point scale factor, flexShrink 0. Text leaves measure to the sizes given (Core Text's,
// already rounded as RCTTextLayoutManager rounds them: ceil((v + 0.001) * scale) / scale).
// Prints every node's frame relative to the window, to check gpu/src/sudoku.rs's layout against.
//   ./build.sh && /tmp/sudoku-yoga W H scale started numpad titleW subtitleW newGameW startW
#include <yoga/Yoga.h>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

static YGConfigRef config;
struct Named { YGNodeRef node; std::string name; };
static std::vector<Named> named;

static YGNodeRef node(const char *name) {
  YGNodeRef n = YGNodeNewWithConfig(config);
  YGNodeStyleSetFlexShrink(n, 0);
  named.push_back({n, name});
  return n;
}
static void add(YGNodeRef parent, YGNodeRef child) { YGNodeInsertChild(parent, child, YGNodeGetChildCount(parent)); }

struct Size { float w, h; };
static float scale;
static float text_round(float v) { return std::ceil((v + 0.001f) * scale) / scale; }
static YGSize measure(YGNodeConstRef n, float, YGMeasureMode, float, YGMeasureMode) {
  Size *s = (Size *)YGNodeGetContext(n);
  return YGSize{text_round(s->w), text_round(s->h)};
}
static YGNodeRef text(const char *name, float w, float h) {
  YGNodeRef n = node(name);
  YGNodeSetContext(n, new Size{w, h});
  YGNodeSetMeasureFunc(n, measure);
  return n;
}

// components/button.tsx: the Animated.View container and its PressableScale.
static YGNodeRef button(const char *name, const char *size, float textW, float textH, bool secondary, float minWidth) {
  YGNodeRef c = node((std::string(name) + ".container").c_str());
  YGNodeStyleSetAlignSelf(c, YGAlignFlexStart);
  YGNodeStyleSetOverflow(c, YGOverflowHidden);
  if (minWidth > 0) YGNodeStyleSetMinWidth(c, minWidth);
  YGNodeRef p = node((std::string(name) + ".pressable").c_str());
  YGNodeStyleSetAlignItems(p, YGAlignCenter);
  YGNodeStyleSetFlexDirection(p, YGFlexDirectionRow);
  YGNodeStyleSetGap(p, YGGutterAll, 8);
  YGNodeStyleSetJustifyContent(p, YGJustifyCenter);
  YGNodeStyleSetOverflow(p, YGOverflowHidden);
  std::string s = size;
  float mw = s == "small" ? 64 : s == "medium" ? 80 : 96;
  float ph = s == "small" ? 12 : s == "medium" ? 16 : 20;
  float pv = s == "small" ? 6 : s == "medium" ? 8 : 10;
  YGNodeStyleSetMinWidth(p, mw);
  YGNodeStyleSetPadding(p, YGEdgeHorizontal, ph);
  YGNodeStyleSetPadding(p, YGEdgeVertical, pv);
  if (secondary) YGNodeStyleSetBorder(p, YGEdgeAll, 1);
  add(c, p);
  add(p, text((std::string(name) + ".text").c_str(), textW, textH));
  return c;
}

int main(int argc, char **argv) {
  if (argc < 10) { fprintf(stderr, "usage\n"); return 1; }
  float W = atof(argv[1]), H = atof(argv[2]);
  scale = atof(argv[3]);
  bool started = atoi(argv[4]), numpad = atoi(argv[5]);
  float titleW = atof(argv[6]), subtitleW = atof(argv[7]), newGameW = atof(argv[8]), startW = atof(argv[9]);
  // SF line heights (hhea (1950 + 494) / 2048 × size).
  auto lh = [](float size) { return (1950.0f + 494.0f) / 2048.0f * size; };
  config = YGConfigNew();
  YGConfigSetPointScaleFactor(config, scale);
  YGConfigSetErrata(config, YGErrataAll);

  YGNodeRef root = node("safeArea");
  YGNodeStyleSetWidth(root, W);
  YGNodeStyleSetHeight(root, H);
  YGNodeRef gradient = node("gradient");
  YGNodeStyleSetFlex(gradient, 1);
  add(root, gradient);
  YGNodeRef content = node("content");
  YGNodeStyleSetFlex(content, 1);
  YGNodeStyleSetAlignItems(content, YGAlignCenter);
  YGNodeStyleSetJustifyContent(content, YGJustifyCenter);
  YGNodeStyleSetPadding(content, YGEdgeAll, 20);
  add(gradient, content);

  YGNodeRef header = node("header");
  YGNodeStyleSetAlignItems(header, YGAlignCenter);
  YGNodeStyleSetMargin(header, YGEdgeBottom, 48);
  add(content, header);
  YGNodeRef titleP = node("title.pressable");
  add(header, titleP);
  add(titleP, text("title.text", titleW, lh(40)));
  YGNodeRef subtitle = text("subtitle", subtitleW, lh(15));
  YGNodeStyleSetMargin(subtitle, YGEdgeTop, 6);
  add(header, subtitle);
  if (started) {
    YGNodeRef actions = node("headerActions");
    YGNodeStyleSetMargin(actions, YGEdgeTop, 16);
    add(header, actions);
    add(actions, button("newGame", "small", newGameW, lh(14), true, 0));
  }

  YGNodeRef box = node("boardContainer");
  YGNodeStyleSetBorder(box, YGEdgeAll, 1);
  YGNodeStyleSetAlignItems(box, YGAlignCenter);
  YGNodeStyleSetJustifyContent(box, YGJustifyCenter);
  YGNodeStyleSetMinHeight(box, 160);
  YGNodeStyleSetMinWidthPercent(box, 100);
  YGNodeStyleSetOverflow(box, YGOverflowHidden);
  YGNodeStyleSetPadding(box, YGEdgeAll, 16);
  add(content, box);
  if (!started) {
    YGNodeRef sc = node("startContainer");
    YGNodeStyleSetAlignItems(sc, YGAlignCenter);
    YGNodeStyleSetPadding(sc, YGEdgeAll, 24);
    add(box, sc);
    add(sc, button("start", "large", startW, lh(16), false, 200));
  } else {
    YGNodeRef wrapper = node("boardWrapper");
    YGNodeStyleSetAlignItems(wrapper, YGAlignCenter);
    YGNodeStyleSetJustifyContent(wrapper, YGJustifyCenter);
    add(box, wrapper);
    YGNodeRef sb = node("sudokuBoard");
    YGNodeStyleSetAlignItems(sb, YGAlignCenter);
    YGNodeStyleSetJustifyContent(sb, YGJustifyCenter);
    add(wrapper, sb);
    float board = std::fmin(W - 48, 400), cell = board / 9;
    YGNodeRef b = node("board");
    YGNodeStyleSetAlignItems(b, YGAlignCenter);
    YGNodeStyleSetJustifyContent(b, YGJustifyCenter);
    YGNodeStyleSetBorder(b, YGEdgeAll, 2);
    YGNodeStyleSetWidth(b, board);
    YGNodeStyleSetHeight(b, board);
    YGNodeStyleSetOverflow(b, YGOverflowHidden);
    add(sb, b);
    for (int r = 0; r < 9; r++) {
      YGNodeRef row = node(("row" + std::to_string(r)).c_str());
      YGNodeStyleSetFlexDirection(row, YGFlexDirectionRow);
      YGNodeStyleSetHeight(row, cell);
      add(b, row);
      for (int c = 0; c < 9; c++) {
        YGNodeRef cl = node(("cell" + std::to_string(r) + std::to_string(c)).c_str());
        YGNodeStyleSetAlignItems(cl, YGAlignCenter);
        YGNodeStyleSetJustifyContent(cl, YGJustifyCenter);
        YGNodeStyleSetBorder(cl, YGEdgeAll, 0.5);
        if ((c + 1) % 3 == 0 && c != 8) YGNodeStyleSetBorder(cl, YGEdgeRight, 2);
        if ((r + 1) % 3 == 0 && r != 8) YGNodeStyleSetBorder(cl, YGEdgeBottom, 2);
        YGNodeStyleSetWidth(cl, cell);
        YGNodeStyleSetHeight(cl, cell);
        add(row, cl);
        YGNodeRef bg = node(("cellbg" + std::to_string(r) + std::to_string(c)).c_str());
        YGNodeStyleSetPositionType(bg, YGPositionTypeAbsolute);
        YGNodeStyleSetPosition(bg, YGEdgeAll, 0);
        add(cl, bg);
      }
    }
    if (numpad) {
      YGNodeRef np = node("numpad");
      YGNodeStyleSetFlexDirection(np, YGFlexDirectionRow);
      YGNodeStyleSetFlexWrap(np, YGWrapWrap);
      YGNodeStyleSetGap(np, YGGutterAll, 10);
      YGNodeStyleSetJustifyContent(np, YGJustifyCenter);
      YGNodeStyleSetMargin(np, YGEdgeTop, 32);
      YGNodeStyleSetMaxWidth(np, std::fmin(W - 32, 400));
      YGNodeStyleSetPadding(np, YGEdgeAll, 12);
      add(sb, np);
      for (int k = 0; k < 10; k++) {
        YGNodeRef nb = node(("key" + std::to_string(k)).c_str());
        YGNodeStyleSetAlignItems(nb, YGAlignCenter);
        YGNodeStyleSetJustifyContent(nb, YGJustifyCenter);
        YGNodeStyleSetBorder(nb, YGEdgeAll, 1);
        YGNodeStyleSetWidth(nb, 46);
        YGNodeStyleSetHeight(nb, 46);
        add(np, nb);
      }
    }
  }

  YGNodeCalculateLayout(root, W, H, YGDirectionLTR);
  // Window-relative frames (rounded layouts summed down the tree, as UIKit composes frames).
  for (auto &n : named) {
    float x = 0, y = 0;
    for (YGNodeConstRef p = n.node; p; p = YGNodeGetParent((YGNodeRef)p)) {
      x += YGNodeLayoutGetLeft(p);
      y += YGNodeLayoutGetTop(p);
    }
    printf("%s %.4f %.4f %.4f %.4f rel %.6f %.6f\n", n.name.c_str(), x, y, YGNodeLayoutGetWidth(n.node), YGNodeLayoutGetHeight(n.node), YGNodeLayoutGetLeft(n.node), YGNodeLayoutGetTop(n.node));
  }
  return 0;
}
