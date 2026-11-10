// The add-to-cart demo's view tree (src/animations/add-to-cart) laid out by React Native 0.88's
// own Yoga (node_modules/react-native/ReactCommon/yoga), with RN Fabric's config: YGErrataAll,
// the device's point scale factor, flexShrink 0. Text leaves measure as RCTTextLayoutManager
// does: a wrapped paragraph is the container's width; sides ceiled after an epsilon
// (ceil((v + 0.001) * scale) / scale). Prints every node's frame relative to the window, to
// check gpu/src/add_to_cart.rs's layout against.
//   ./build.sh && /tmp/add-to-cart-yoga W H scale safeTop titleW lineH iconW iconH badgeTextW
//     badgeLineH sheetTitleW sheetMessageW ctaW addW toW cartW spaceW p...
// (the list's first row; then the ConfirmButton from that row's buy button at each progress p).
#include <yoga/Yoga.h>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

static YGConfigRef config;
struct Named { YGNodeRef node; std::string name; };
static std::vector<Named> named;
static float scale;

static YGNodeRef node(const char *name) {
  YGNodeRef n = YGNodeNewWithConfig(config);
  YGNodeStyleSetFlexShrink(n, 0);
  named.push_back({n, name});
  return n;
}
static void add(YGNodeRef parent, YGNodeRef child) { YGNodeInsertChild(parent, child, YGNodeGetChildCount(parent)); }
static float text_scale;
static float text_round(float v) { return std::ceil((v + 0.001f) * text_scale) / text_scale; }

// A paragraph: its one-line width, its line height, how many lines it may wrap to (0: no
// limit), and its words' widths for a greedy wrap (a word wider than the line breaks alone).
struct Para { float width, line; int maxLines; std::vector<float> words; float space; };
static YGSize measure(YGNodeConstRef n, float w, YGMeasureMode wm, float, YGMeasureMode) {
  Para *p = (Para *)YGNodeGetContext(n);
  float limit = wm == YGMeasureModeUndefined ? INFINITY : w;
  if (p->width <= limit) return YGSize{text_round(p->width), text_round(p->line)};
  // One unbreakable glyph (an icon) stays on its line, overflowing: no wrap.
  if (p->words.empty() && p->maxLines == 0) return YGSize{text_round(p->width), text_round(p->line)};
  int lines = 1;
  if (!p->words.empty()) {
    float x = 0;
    for (size_t i = 0; i < p->words.size(); i++) {
      float add = (x == 0 ? 0 : p->space) + p->words[i];
      if (x > 0 && x + add > limit) { lines++; x = p->words[i]; } else x += add;
    }
  } else {
    lines = 2;
  }
  if (p->maxLines > 0 && lines > p->maxLines) lines = p->maxLines;
  // textDidWrap: the container's width.
  return YGSize{text_round(limit), text_round(p->line * lines)};
}
static YGNodeRef text(const char *name, Para *p) {
  YGNodeRef n = node(name);
  YGNodeSetContext(n, p);
  YGNodeSetMeasureFunc(n, measure);
  return n;
}

static void dump(YGNodeRef root) {
  for (auto &n : named) {
    float x = 0, y = 0;
    for (YGNodeRef m = n.node; m; m = YGNodeGetParent(m)) { x += YGNodeLayoutGetLeft(m); y += YGNodeLayoutGetTop(m); }
    printf("%s %.4f %.4f %.4f %.4f rel %.6f %.6f\n", n.name.c_str(), x, y, YGNodeLayoutGetWidth(n.node), YGNodeLayoutGetHeight(n.node), YGNodeLayoutGetLeft(n.node), YGNodeLayoutGetTop(n.node));
  }
}

int main(int argc, char **argv) {
  if (argc < 18) { fprintf(stderr, "usage\n"); return 1; }
  float W = atof(argv[1]), H = atof(argv[2]);
  scale = atof(argv[3]);
  // A scale of 0 lays out unrounded (the texts still measure at 3x).
  text_scale = scale > 0 ? scale : 3;
  float T = atof(argv[4]);
  Para title{(float)atof(argv[5]), (float)atof(argv[6]), 0, {}, 0};
  Para desc{2000, (float)atof(argv[6]), 2, {}, 0};
  Para icon{(float)atof(argv[7]), (float)atof(argv[8]), 0, {}, 0};
  Para badge{(float)atof(argv[9]), (float)atof(argv[10]), 0, {}, 0};
  config = YGConfigNew();
  YGConfigSetPointScaleFactor(config, scale);
  YGConfigSetErrata(config, YGErrataAll);

  // The demo's container (flex 1) → FlatList (flex 1: a ScrollView) → its content container
  // (paddingTop top + 24, paddingBottom 100) → the first cell → ListItem.
  YGNodeRef root = node("root");
  YGNodeStyleSetWidth(root, W);
  YGNodeStyleSetHeight(root, H);
  YGNodeRef content = node("content");
  YGNodeStyleSetPadding(content, YGEdgeTop, T + 24);
  YGNodeStyleSetPadding(content, YGEdgeBottom, 100);
  YGNodeStyleSetWidth(content, W);
  add(root, content);
  YGNodeRef cell = node("cell");
  add(content, cell);
  YGNodeRef row = node("row");
  YGNodeStyleSetAlignItems(row, YGAlignCenter);
  YGNodeStyleSetAlignSelf(row, YGAlignCenter);
  YGNodeStyleSetFlexDirection(row, YGFlexDirectionRow);
  YGNodeStyleSetHeight(row, 85);
  YGNodeStyleSetJustifyContent(row, YGJustifySpaceBetween);
  YGNodeStyleSetMargin(row, YGEdgeAll, 10);
  YGNodeStyleSetPadding(row, YGEdgeLeft, 15);
  YGNodeStyleSetPadding(row, YGEdgeRight, 20);
  YGNodeStyleSetWidthPercent(row, 90);
  add(cell, row);
  YGNodeRef left = node("left");
  YGNodeStyleSetFlex(left, 1);
  YGNodeStyleSetFlexDirection(left, YGFlexDirectionRow);
  add(row, left);
  YGNodeRef image = node("image");
  YGNodeStyleSetHeightPercent(image, 65);
  YGNodeStyleSetAspectRatio(image, 1);
  add(left, image);
  YGNodeRef labels = node("labels");
  YGNodeStyleSetPadding(labels, YGEdgeLeft, 10);
  YGNodeStyleSetJustifyContent(labels, YGJustifyCenter);
  add(left, labels);
  YGNodeRef t = text("title", &title);
  YGNodeStyleSetMargin(t, YGEdgeBottom, 5);
  add(labels, t);
  YGNodeRef d = text("description", &desc);
  YGNodeStyleSetMaxWidthPercent(d, 80);
  add(labels, d);
  YGNodeRef press = node("press");
  add(row, press);
  YGNodeRef b = node("badge");
  YGNodeStyleSetAlignItems(b, YGAlignCenter);
  YGNodeStyleSetAspectRatio(b, 1);
  YGNodeStyleSetHeight(b, 15);
  YGNodeStyleSetJustifyContent(b, YGJustifyCenter);
  YGNodeStyleSetPositionType(b, YGPositionTypeAbsolute);
  YGNodeStyleSetPosition(b, YGEdgeRight, -2.5);
  YGNodeStyleSetPosition(b, YGEdgeTop, -2.5);
  add(press, b);
  YGNodeRef bt = text("badge.text", &badge);
  add(b, bt);
  YGNodeRef button = node("button");
  YGNodeStyleSetHeight(button, 40);
  YGNodeStyleSetWidth(button, 40);
  YGNodeStyleSetJustifyContent(button, YGJustifyCenter);
  YGNodeStyleSetAlignItems(button, YGAlignCenter);
  add(press, button);
  YGNodeRef ic = text("button.icon", &icon);
  add(button, ic);

  // BottomSheet: absolute, left 0, right 0, bottom 0, height 300, paddingBottom 100; its
  // View (flex 1, paddingVertical 20, paddingHorizontal 5 %) and two Texts.
  YGNodeRef sheet = node("sheet");
  YGNodeStyleSetPositionType(sheet, YGPositionTypeAbsolute);
  YGNodeStyleSetPosition(sheet, YGEdgeLeft, 0);
  YGNodeStyleSetPosition(sheet, YGEdgeRight, 0);
  YGNodeStyleSetPosition(sheet, YGEdgeBottom, 0);
  YGNodeStyleSetHeight(sheet, 300);
  YGNodeStyleSetPadding(sheet, YGEdgeBottom, 100);
  add(root, sheet);
  YGNodeRef sv = node("sheet.view");
  YGNodeStyleSetFlex(sv, 1);
  YGNodeStyleSetPadding(sv, YGEdgeVertical, 20);
  YGNodeStyleSetPaddingPercent(sv, YGEdgeHorizontal, 5);
  add(sheet, sv);
  static Para st{(float)atof(argv[11]), 23.8671875f, 0, {}, 0};
  YGNodeRef stn = text("sheet.title", &st);
  add(sv, stn);
  static Para sm{(float)atof(argv[12]), (float)atof(argv[6]), 0, {}, 0};
  YGNodeRef smn = text("sheet.message", &sm);
  YGNodeStyleSetMargin(smn, YGEdgeTop, 10);
  add(sv, smn);

  YGNodeCalculateLayout(root, W, H, YGDirectionLTR);
  dump(root);

  // ConfirmButton from the first row's buy button (its rounded window frame, as measure gives
  // it), at each progress: absolute top/left/width/height interpolated, a centred row of the
  // "ADD TO CART" View (flex 4p; its Text paddingHorizontal 15) and the icon's View (flex 1).
  float px = 0, py = 0;
  for (YGNodeRef m = button; m; m = YGNodeGetParent(m)) { px += YGNodeLayoutGetLeft(m); py += YGNodeLayoutGetTop(m); }
  float bw = YGNodeLayoutGetWidth(button), bh = YGNodeLayoutGetHeight(button);
  static Para cta{(float)atof(argv[13]), (float)atof(argv[6]), 0, {}, 0};
  std::vector<float> words;
  for (int i = 14; i < 17; i++) words.push_back(atof(argv[i]));
  cta.words = words;
  cta.space = atof(argv[17]);
  for (int i = 18; i < argc; i++) {
    // Reanimated interpolates in double; Yoga stores the style as float.
    double p = atof(argv[i]);
    named.clear();
    YGNodeRef r = node("croot");
    YGNodeStyleSetWidth(r, W);
    YGNodeStyleSetHeight(r, H);
    YGNodeRef cb = node("confirm");
    YGNodeStyleSetPositionType(cb, YGPositionTypeAbsolute);
    YGNodeStyleSetFlexDirection(cb, YGFlexDirectionRow);
    YGNodeStyleSetJustifyContent(cb, YGJustifyCenter);
    YGNodeStyleSetAlignItems(cb, YGAlignCenter);
    auto lerp = [&](double a, double b) { return (float)(a + (b - a) * p); };
    YGNodeStyleSetPosition(cb, YGEdgeTop, lerp(py, H - 100));
    YGNodeStyleSetPosition(cb, YGEdgeLeft, lerp(px, W * 0.05f));
    YGNodeStyleSetWidth(cb, lerp(bw, W * 0.9f));
    YGNodeStyleSetHeight(cb, lerp(bh, 45));
    add(r, cb);
    YGNodeRef tv = node("confirm.textView");
    YGNodeStyleSetFlex(tv, (float)(4 * p));
    add(cb, tv);
    YGNodeRef tt = text("confirm.text", &cta);
    YGNodeStyleSetPadding(tt, YGEdgeHorizontal, 15);
    add(tv, tt);
    YGNodeRef iv = node("confirm.iconView");
    YGNodeStyleSetFlex(iv, 1);
    YGNodeStyleSetJustifyContent(iv, YGJustifyCenter);
    YGNodeStyleSetAlignItems(iv, YGAlignCenter);
    add(cb, iv);
    YGNodeRef ii = text("confirm.icon", &icon);
    add(iv, ii);
    YGNodeCalculateLayout(r, W, H, YGDirectionLTR);
    printf("p %g\n", (double)p);
    dump(r);
  }
  return 0;
}
