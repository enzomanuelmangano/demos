// Blur probe: measures UIKit's partially animated UIVisualEffectView (expo-blur's BlurView: a
// paused UIViewPropertyAnimator whose fractionComplete is intensity / 100) on the iOS Simulator.
//   ./build.sh                     builds BlurProbe.app for the simulator
//   -mode dump                     writes Documents/dump.txt: per style and fraction, the view and
//                                  layer tree, each layer's filters (model and presentation), its
//                                  animations, colours, opacities, CABackdropLayer's properties
//   -mode render -style S -fraction F -pattern P
//                                  draws pattern P with one effect view over it, for a screenshot
// The window is dark (the Demos app's userInterfaceStyle), unless -ui light.
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#import <objc/runtime.h>

static NSMutableString *gOut;
static void out(NSString *fmt, ...) NS_FORMAT_FUNCTION(1, 2);
static void out(NSString *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  NSString *s = [[NSString alloc] initWithFormat:fmt arguments:ap];
  va_end(ap);
  [gOut appendString:s];
  [gOut appendString:@"\n"];
}

static NSDictionary<NSString *, NSNumber *> *styles(void) {
  return @{
    @"extraLight" : @(UIBlurEffectStyleExtraLight),
    @"light" : @(UIBlurEffectStyleLight),
    @"dark" : @(UIBlurEffectStyleDark),
    @"regular" : @(UIBlurEffectStyleRegular),
    @"prominent" : @(UIBlurEffectStyleProminent),
    @"systemUltraThinMaterial" : @(UIBlurEffectStyleSystemUltraThinMaterial),
    @"systemThinMaterial" : @(UIBlurEffectStyleSystemThinMaterial),
    @"systemMaterial" : @(UIBlurEffectStyleSystemMaterial),
    @"systemThickMaterial" : @(UIBlurEffectStyleSystemThickMaterial),
    @"systemChromeMaterial" : @(UIBlurEffectStyleSystemChromeMaterial),
    @"systemUltraThinMaterialLight" : @(UIBlurEffectStyleSystemUltraThinMaterialLight),
    @"systemMaterialLight" : @(UIBlurEffectStyleSystemMaterialLight),
    @"systemUltraThinMaterialDark" : @(UIBlurEffectStyleSystemUltraThinMaterialDark),
    @"systemMaterialDark" : @(UIBlurEffectStyleSystemMaterialDark),
  };
}

static NSString *colorString(CGColorRef c) {
  if (!c) return @"nil";
  size_t n = CGColorGetNumberOfComponents(c);
  const CGFloat *p = CGColorGetComponents(c);
  NSMutableString *s = [NSMutableString string];
  CFStringRef name = CGColorSpaceCopyName(CGColorGetColorSpace(c));
  [s appendFormat:@"%@(", name ? (__bridge NSString *)name : @"?"];
  if (name) CFRelease(name);
  for (size_t i = 0; i < n; i++) [s appendFormat:@"%s%.6f", i ? " " : "", p[i]];
  [s appendString:@")"];
  return s;
}

static NSString *valueString(id v) {
  if (!v) return @"nil";
  if ([v isKindOfClass:[NSValue class]] && ![v isKindOfClass:[NSNumber class]]) {
    NSValue *nv = v;
    const char *t = nv.objCType;
    if (strstr(t, "CAColorMatrix")) {
      float m[20];
      [nv getValue:m size:sizeof(m)];
      NSMutableString *s = [NSMutableString stringWithString:@"colorMatrix["];
      for (int i = 0; i < 20; i++) [s appendFormat:@"%s%.6f", i ? (i % 5 ? " " : " | ") : "", m[i]];
      [s appendString:@"]"];
      return s;
    }
    return [NSString stringWithFormat:@"NSValue<%s>%@", t, nv];
  }
  if (CFGetTypeID((__bridge CFTypeRef)v) == CGColorGetTypeID()) return colorString((__bridge CGColorRef)v);
  if ([v isKindOfClass:[NSArray class]]) {
    NSMutableArray *a = [NSMutableArray array];
    for (id x in v) [a addObject:valueString(x)];
    return [NSString stringWithFormat:@"[%@]", [a componentsJoinedByString:@", "]];
  }
  if ([v isKindOfClass:[NSNumber class]]) return [NSString stringWithFormat:@"%.6f", [v doubleValue]];
  return [[v description] stringByReplacingOccurrencesOfString:@"\n" withString:@" "];
}

static id safeValue(id obj, NSString *key) {
  @try {
    return [obj valueForKey:key];
  } @catch (NSException *e) {
    return @"<no key>";
  }
}

static void dumpIvars(id f, NSString *indent) {
  for (Class c = [f class]; c && c != [NSObject class]; c = class_getSuperclass(c)) {
    unsigned n = 0;
    Ivar *iv = class_copyIvarList(c, &n);
    for (unsigned i = 0; i < n; i++) {
      const char *t = ivar_getTypeEncoding(iv[i]);
      if (t[0] == '@') out(@"%@  ivar %s = %@", indent, ivar_getName(iv[i]), valueString(object_getIvar(f, iv[i])));
      else out(@"%@  ivar %s <%s>", indent, ivar_getName(iv[i]), t);
    }
    free(iv);
  }
}

static void dumpFilter(id f, NSString *indent) {
  NSString *name = safeValue(f, @"name");
  NSString *type = safeValue(f, @"type");
  out(@"%@filter name=%@ type=%@ class=%@", indent, name, type, NSStringFromClass([f class]));
  NSArray *keys = nil;
  if ([f respondsToSelector:NSSelectorFromString(@"inputKeys")]) keys = [f valueForKey:@"inputKeys"];
  NSMutableSet *all = [NSMutableSet setWithArray:keys ?: @[]];
  for (NSString *k in @[ @"inputRadius", @"inputAmount", @"inputColorMatrix", @"inputNormalizeEdges",
                         @"inputNormalizeEdgesTransparent", @"inputQuality", @"inputIntermediateBitDepth",
                         @"inputHardEdges", @"inputDither", @"inputBias", @"inputColor", @"inputReversed",
                         @"inputScale", @"inputBackdropAware", @"inputSaturation", @"inputBrightness",
                         @"inputTintColor", @"inputEdgeBias", @"inputValues", @"inputPoints", @"inputCurve", @"inputCurvePoints" ])
    [all addObject:k];
  for (NSString *k in [[all allObjects] sortedArrayUsingSelector:@selector(compare:)]) {
    id v = safeValue(f, k);
    if (v && ![v isEqual:@"<no key>"]) out(@"%@  %@ = %@", indent, k, valueString(v));
  }
  if ([f respondsToSelector:NSSelectorFromString(@"enabled")]) out(@"%@  enabled = %@", indent, safeValue(f, @"enabled"));
  dumpIvars(f, indent);
}

static void dumpAnimation(CAAnimation *a, NSString *key, NSString *indent) {
  NSMutableString *s = [NSMutableString stringWithFormat:@"%@anim key=%@ class=%@ speed=%.3f timeOffset=%.4f begin=%.4f dur=%.4f fill=%@",
                                                         indent, key, NSStringFromClass([a class]), a.speed, a.timeOffset,
                                                         a.beginTime, a.duration, a.fillMode];
  if (a.timingFunction) {
    float c1[2], c2[2];
    [a.timingFunction getControlPointAtIndex:1 values:c1];
    [a.timingFunction getControlPointAtIndex:2 values:c2];
    [s appendFormat:@" timing=(%.3f %.3f %.3f %.3f)", c1[0], c1[1], c2[0], c2[1]];
  }
  if ([a isKindOfClass:[CAPropertyAnimation class]]) [s appendFormat:@" keyPath=%@", ((CAPropertyAnimation *)a).keyPath];
  if ([a isKindOfClass:[CABasicAnimation class]]) {
    CABasicAnimation *b = (CABasicAnimation *)a;
    [s appendFormat:@" from=%@ to=%@ by=%@ additive=%d", valueString(b.fromValue), valueString(b.toValue), valueString(b.byValue), b.additive];
  }
  if ([a isKindOfClass:[CASpringAnimation class]]) {
    CASpringAnimation *sp = (CASpringAnimation *)a;
    [s appendFormat:@" spring(m %.3f k %.3f c %.3f)", sp.mass, sp.stiffness, sp.damping];
  }
  out(@"%@", s);
  if ([a isKindOfClass:[CAAnimationGroup class]])
    for (CAAnimation *c in ((CAAnimationGroup *)a).animations) dumpAnimation(c, @"(group)", [indent stringByAppendingString:@"  "]);
}

static void dumpLayer(CALayer *l, NSString *indent) {
  CALayer *p = l.presentationLayer;
  out(@"%@layer %@ frame=%@ opacity=%.4f(pres %.4f) bg=%@ (pres %@) hidden=%d cornerRadius=%.2f", indent,
      NSStringFromClass([l class]), NSStringFromCGRect(l.frame), l.opacity, p ? p.opacity : -1, colorString(l.backgroundColor),
      p ? colorString(p.backgroundColor) : @"-", l.hidden, l.cornerRadius);
  if (l.compositingFilter) out(@"%@  compositingFilter = %@", indent, valueString(l.compositingFilter));
  if (l.filters.count) {
    out(@"%@  filters (model):", indent);
    for (id f in l.filters) dumpFilter(f, [indent stringByAppendingString:@"    "]);
  }
  if (p.filters.count) {
    out(@"%@  filters (presentation):", indent);
    for (id f in p.filters) dumpFilter(f, [indent stringByAppendingString:@"    "]);
  }
  if (l.backgroundFilters.count) {
    out(@"%@  backgroundFilters:", indent);
    for (id f in l.backgroundFilters) dumpFilter(f, [indent stringByAppendingString:@"    "]);
  }
  if ([NSStringFromClass([l class]) containsString:@"Backdrop"]) {
    for (NSString *k in @[ @"scale", @"groupName", @"marginWidth", @"zoom", @"bleedAmount", @"captureOnly",
                           @"allowsInPlaceFiltering", @"disablesOccludedBackdropBlurs", @"ignoresOffscreenGroups",
                           @"windowServerAware", @"backdropRect", @"statisticsType", @"tracksLuma", @"reducesCaptureBitDepth",
                           @"allowsSubstituteColor", @"usesGlobalGroupNamespace" ]) {
      id v = safeValue(l, k);
      out(@"%@  backdrop.%@ = %@", indent, k, valueString(v));
      if (p) out(@"%@  backdrop(pres).%@ = %@", indent, k, valueString(safeValue(p, k)));
    }
  }
  for (NSString *k in l.animationKeys) dumpAnimation([l animationForKey:k], k, [indent stringByAppendingString:@"  "]);
  for (CALayer *s in l.sublayers) dumpLayer(s, [indent stringByAppendingString:@"  "]);
}

static void dumpView(UIView *v, NSString *indent) {
  out(@"%@view %@ frame=%@ alpha=%.4f bg=%@ hidden=%d", indent, NSStringFromClass([v class]), NSStringFromCGRect(v.frame), v.alpha,
      colorString(v.backgroundColor.CGColor), v.hidden);
  for (UIView *s in v.subviews) dumpView(s, [indent stringByAppendingString:@"  "]);
}

@interface Probe : UIResponder <UIApplicationDelegate, UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@property(nonatomic, strong) NSMutableArray *animators;
@end

// Display P3 (RN's RCTColorSpace.displayP3), or sRGB with -space srgb.
static UIColor *p3(double r, double g, double b, double a) {
  if ([[[NSUserDefaults standardUserDefaults] stringForKey:@"space"] isEqual:@"srgb"]) return [UIColor colorWithRed:r green:g blue:b alpha:a];
  return [UIColor colorWithDisplayP3Red:r green:g blue:b alpha:a];
}

@implementation Probe
- (BOOL)application:(UIApplication *)app didFinishLaunchingWithOptions:(NSDictionary *)opts {
  return YES;
}

- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session
                              options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *c = [[UISceneConfiguration alloc] initWithName:@"probe" sessionRole:session.role];
  c.delegateClass = [Probe class];
  return c;
}

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  gOut = [NSMutableString string];
  self.animators = [NSMutableArray array];
  NSUserDefaults *d = [NSUserDefaults standardUserDefaults];
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  self.window.overrideUserInterfaceStyle = [[d stringForKey:@"ui"] isEqual:@"light"] ? UIUserInterfaceStyleLight : UIUserInterfaceStyleDark;
  UIViewController *vc = [UIViewController new];
  vc.view.backgroundColor = UIColor.blackColor;
  self.window.rootViewController = vc;
  [self.window makeKeyAndVisible];
  NSString *mode = [d stringForKey:@"mode"] ?: @"dump";
  if ([mode isEqual:@"dump"])
    [self dump:vc.view];
  else
    [self render:vc.view];
}

- (UIVisualEffectView *)effect:(NSString *)style fraction:(double)f frame:(CGRect)frame in:(UIView *)root {
  if ([style isEqual:@"none"]) return nil;
  UIVisualEffectView *v = [[UIVisualEffectView alloc] initWithEffect:nil];
  double bg = [[NSUserDefaults standardUserDefaults] doubleForKey:@"bgwhite"];
  if (bg > 0) {
    // expo-blur's ExpoBlurView: the RN style's backgroundColor on the effect view's superview.
    UIView *host = [[UIView alloc] initWithFrame:frame];
    host.backgroundColor = [UIColor colorWithRed:1 green:1 blue:1 alpha:bg];
    [root addSubview:host];
    v.frame = host.bounds;
    [host addSubview:v];
  } else {
    v.frame = frame;
    [root addSubview:v];
  }
  UIBlurEffect *e = [UIBlurEffect effectWithStyle:(UIBlurEffectStyle)[styles()[style] integerValue]];
  if (f < 0) {
    v.effect = e;  // no animator: the effect at full strength
    return v;
  }
  UIViewPropertyAnimator *a = [[UIViewPropertyAnimator alloc] initWithDuration:1 curve:UIViewAnimationCurveLinear animations:^{
    v.effect = e;
  }];
  a.pausesOnCompletion = YES;
  a.fractionComplete = f;
  [self.animators addObject:a];
  return v;
}

- (void)dump:(UIView *)root {
  NSUserDefaults *d = [NSUserDefaults standardUserDefaults];
  NSArray *names = [[d stringForKey:@"styles"] ?: @"regular,systemMaterialDark,systemUltraThinMaterialLight" componentsSeparatedByString:@","];
  NSArray *fractions = @[ @(-1), @0.01, @0.2, @0.4, @0.65, @0.7, @1.0 ];
  NSMutableArray *views = [NSMutableArray array];
  for (NSString *n in names)
    for (NSNumber *f in fractions) [views addObject:@[ n, f, [self effect:n fraction:f.doubleValue frame:CGRectMake(10, 100, 100, 100) in:root] ]];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    out(@"screen scale=%.2f ui=%ld", UIScreen.mainScreen.scale, (long)self.window.traitCollection.userInterfaceStyle);
    for (NSArray *e in views) {
      out(@"\n===== style=%@ fraction=%@ =====", e[0], [e[1] doubleValue] < 0 ? @"none(direct)" : e[1]);
      dumpView(e[2], @"");
      dumpLayer(((UIView *)e[2]).layer, @"");
    }
    NSString *path = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES)[0] stringByAppendingPathComponent:@"dump.txt"];
    [gOut writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil];
    NSLog(@"PROBE DONE %@", path);
  });
}

// Patterns, all in Display P3 (RN's colour space), in points of a 420 × 912 screen.
- (void)render:(UIView *)root {
  NSUserDefaults *d = [NSUserDefaults standardUserDefaults];
  NSString *style = [d stringForKey:@"style"] ?: @"regular";
  double f = [d objectForKey:@"fraction"] ? [d doubleForKey:@"fraction"] : -1;
  NSString *pattern = [d stringForKey:@"pattern"] ?: @"step";
  CGRect b = root.bounds;
  if ([pattern isEqual:@"step"]) {
    // Left half black, right half white; a white band across the top half's middle.
    UIView *w = [[UIView alloc] initWithFrame:CGRectMake(b.size.width / 2, 0, b.size.width / 2, b.size.height)];
    w.backgroundColor = p3(1, 1, 1, 1);
    [root addSubview:w];
    UIView *band = [[UIView alloc] initWithFrame:CGRectMake(0, 300, b.size.width / 2, 40)];
    band.backgroundColor = p3(1, 1, 1, 1);
    [root addSubview:band];
    // Just outside the effect: a white bar above its top edge (on black) and a black bar below
    // its bottom edge (on white), to see whether the backdrop reads beyond its bounds.
    UIView *above = [[UIView alloc] initWithFrame:CGRectMake(60, 110, 150, 40)];
    above.backgroundColor = p3(1, 1, 1, 1);
    [root addSubview:above];
    UIView *below = [[UIView alloc] initWithFrame:CGRectMake(210, 750, 150, 40)];
    below.backgroundColor = p3(0, 0, 0, 1);
    [root addSubview:below];
    // The effect: 60..360 × 150..750 pt.
    [self effect:style fraction:f frame:CGRectMake(60, 150, 300, 600) in:root];
  } else if ([pattern hasPrefix:@"flat"]) {
    // flat:r,g,b (0…255, P3): the whole screen one colour, an effect over the middle.
    NSArray *c = [[pattern substringFromIndex:5] componentsSeparatedByString:@","];
    root.backgroundColor = p3([c[0] doubleValue] / 255, [c[1] doubleValue] / 255, [c[2] doubleValue] / 255, 1);
    [self effect:style fraction:f frame:CGRectMake(60, 150, 300, 600) in:root];
  } else if ([pattern isEqual:@"patches"]) {
    // 24 colour patches (6 rows × 4), each 105 × 152 pt; an effect view per patch, inset 40 pt.
    NSArray *cs = @[ @[@255,@0,@0], @[@0,@255,@0], @[@0,@0,@255], @[@255,@255,@0],
                     @[@0,@255,@255], @[@255,@0,@255], @[@128,@128,@128], @[@64,@64,@64],
                     @[@192,@192,@192], @[@32,@32,@32], @[@224,@224,@224], @[@0,@0,@0],
                     @[@255,@255,@255], @[@200,@100,@50], @[@50,@100,@200], @[@100,@200,@50],
                     @[@239,@239,@239], @[@173,@137,@105], @[@236,@217,@185], @[@17,@17,@17],
                     @[@150,@30,@90], @[@30,@150,@120], @[@250,@180,@200], @[@90,@60,@20] ];
    if ([d stringForKey:@"colors"]) {
      NSMutableArray *list = [NSMutableArray array];
      for (NSString *t in [[d stringForKey:@"colors"] componentsSeparatedByString:@";"]) {
        NSArray *c = [t componentsSeparatedByString:@","];
        [list addObject:@[ @([c[0] intValue]), @([c[1] intValue]), @([c[2] intValue]) ]];
      }
      cs = list;
    }
    for (int i = 0; i < 24; i++) {
      CGRect r = CGRectMake((i % 4) * 105, (i / 4) * 152, 105, 152);
      UIView *v = [[UIView alloc] initWithFrame:r];
      NSArray *c = cs[i];
      v.backgroundColor = p3([c[0] doubleValue] / 255, [c[1] doubleValue] / 255, [c[2] doubleValue] / 255, 1);
      [root addSubview:v];
    }
    for (int i = 0; i < 24; i++) {
      CGRect r = CGRectMake((i % 4) * 105, (i / 4) * 152, 105, 152);
      [self effect:style fraction:f frame:CGRectInset(r, 40, 50) in:root];
    }
  }
}
@end

int main(int argc, char *argv[]) {
  @autoreleasepool {
    return UIApplicationMain(argc, argv, nil, NSStringFromClass([Probe class]));
  }
}
