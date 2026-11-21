// The image-cropper demo's view tree (src/animations/image-cropper/index.tsx and
// components/border-button) laid out by React Native 0.88's own Yoga
// (node_modules/react-native/ReactCommon/yoga), with RN Fabric's config: YGErrataAll, the
// device's point scale factor, flexShrink 0. Text leaves measure as RCTTextLayoutManager does:
// sides ceiled after an epsilon (ceil((v + 0.001) * scale) / scale). Prints every node's frame
// relative to the window, to check gpu/src/image_cropper.rs's layout against.
//   ./build.sh && /tmp/image-cropper-yoga W H scale lineH expandW collapseW cropW backW
// (the text widths: Core Text's, letterSpacing 1 after every glyph; the line: SF 14's).
#include <yoga/Yoga.h>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

static YGConfigRef config;
struct Named { YGNodeRef node; std::string name; };
static std::vector<Named> named;
static float text_scale;

static YGNodeRef node(const char *name) {
  YGNodeRef n = YGNodeNewWithConfig(config);
  YGNodeStyleSetFlexShrink(n, 0);
  named.push_back({n, name});
  return n;
}
static void add(YGNodeRef parent, YGNodeRef child) { YGNodeInsertChild(parent, child, YGNodeGetChildCount(parent)); }
static float text_round(float v) { return std::ceil((v + 0.001f) * text_scale) / text_scale; }

struct Para { float width, line; };
static YGSize measure(YGNodeConstRef n, float, YGMeasureMode, float, YGMeasureMode) {
  Para *p = (Para *)YGNodeGetContext(n);
  return YGSize{text_round(p->width), text_round(p->line)};
}

// FancyBorderButton: a PressableScale (BaseButton) with borderWidth 1, padding 16, its Text.
static YGNodeRef button(const char *name, Para *p) {
  YGNodeRef b = node(name);
  YGNodeStyleSetBorder(b, YGEdgeAll, 1);
  YGNodeStyleSetPadding(b, YGEdgeAll, 16);
  std::string tn = std::string(name) + ".text";
  YGNodeRef t = node(strdup(tn.c_str()));
  YGNodeSetContext(t, p);
  YGNodeSetMeasureFunc(t, measure);
  add(b, t);
  return b;
}

static void dump() {
  for (auto &n : named) {
    float x = 0, y = 0;
    for (YGNodeRef m = n.node; m; m = YGNodeGetParent(m)) { x += YGNodeLayoutGetLeft(m); y += YGNodeLayoutGetTop(m); }
    printf("%s %.4f %.4f %.4f %.4f\n", n.name.c_str(), x, y, YGNodeLayoutGetWidth(n.node), YGNodeLayoutGetHeight(n.node));
  }
}

int main(int argc, char **argv) {
  if (argc < 9) { fprintf(stderr, "usage: W H scale lineH expandW collapseW cropW backW\n"); return 1; }
  float W = atof(argv[1]), H = atof(argv[2]);
  float scale = atof(argv[3]);
  text_scale = scale;
  float line = atof(argv[4]);
  Para expand{(float)atof(argv[5]), line}, collapse{(float)atof(argv[6]), line},
      crop{(float)atof(argv[7]), line}, back{(float)atof(argv[8]), line};
  config = YGConfigNew();
  YGConfigSetPointScaleFactor(config, scale);
  YGConfigSetErrata(config, YGErrataAll);

  // styles.container: alignItems center, flex 1, justifyContent center (the window).
  YGNodeRef root = node("container");
  YGNodeStyleSetAlignItems(root, YGAlignCenter);
  YGNodeStyleSetJustifyContent(root, YGJustifyCenter);
  // The Touchable.Canvas: alignSelf center, width, height = width × imageRatio (1).
  YGNodeRef canvas = node("canvas");
  YGNodeStyleSetAlignSelf(canvas, YGAlignCenter);
  YGNodeStyleSetWidth(canvas, W);
  YGNodeStyleSetHeight(canvas, W);
  add(root, canvas);
  // styles.buttonsContainer.
  YGNodeRef row = node("buttons");
  YGNodeStyleSetFlexDirection(row, YGFlexDirectionRow);
  YGNodeStyleSetFlexWrap(row, YGWrapWrap);
  YGNodeStyleSetJustifyContent(row, YGJustifySpaceEvenly);
  YGNodeStyleSetMargin(row, YGEdgeHorizontal, 10);
  YGNodeStyleSetMargin(row, YGEdgeTop, 20);
  YGNodeStyleSetWidthPercent(row, 100);
  add(root, row);
  add(row, button("expand", &expand));
  add(row, button("collapse", &collapse));
  add(row, button("crop", &crop));
  YGNodeCalculateLayout(root, W, H, YGDirectionLTR);
  dump();
  named.clear();

  // The Modal's content: Modal.js's container (flex 1) > styles.detailContainer (alignItems
  // center, flex 1, justifyContent center) > the Canvas (width × width) and
  // styles.backButtonContainer (absolute, bottom 100, right 20) > the Back button.
  YGNodeRef modal = node("modal");
  YGNodeRef detail = node("detail");
  YGNodeStyleSetFlexGrow(detail, 1);
  YGNodeStyleSetAlignItems(detail, YGAlignCenter);
  YGNodeStyleSetJustifyContent(detail, YGJustifyCenter);
  add(modal, detail);
  YGNodeRef dcanvas = node("detail.canvas");
  YGNodeStyleSetWidth(dcanvas, W);
  YGNodeStyleSetHeight(dcanvas, W);
  add(detail, dcanvas);
  YGNodeRef bc = node("backContainer");
  YGNodeStyleSetPositionType(bc, YGPositionTypeAbsolute);
  YGNodeStyleSetPosition(bc, YGEdgeBottom, 100);
  YGNodeStyleSetPosition(bc, YGEdgeRight, 20);
  add(detail, bc);
  add(bc, button("back", &back));
  YGNodeCalculateLayout(modal, W, H, YGDirectionLTR);
  dump();
  return 0;
}
