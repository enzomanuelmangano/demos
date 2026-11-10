// Text probe: where UIKit puts an RN <Text>'s glyphs, and the pixels it draws, on the iOS
// Simulator. Each case is laid out and drawn as RN's RCTTextLayoutManager does (an
// NSTextStorage, NSLayoutManager with usesFontLeading NO, an NSTextContainer of the box's size
// with lineFragmentPadding 0, drawGlyphsForGlyphRange at the content frame's origin, inside an
// RCTParagraphTextView-like view's drawRect:), in a view at a pixel-aligned origin.
// Writes Documents/text.txt: per case the font's metrics, the line fragment and used rects,
// each glyph's location (x, baseline), and the view's pixels (alpha of white text) in hex.
//   ./build.sh; ./run.sh <sim>
#import <UIKit/UIKit.h>
#import <CoreText/CoreText.h>
#import <objc/runtime.h>

static NSMutableString *gOut;

@interface TextView : UIView
@property(nonatomic) NSAttributedString *text;
@end
@implementation TextView
- (NSLayoutManager *)layout:(NSTextContainer **)containerOut {
  NSTextContainer *c = [[NSTextContainer alloc] initWithSize:self.bounds.size];
  c.lineFragmentPadding = 0.0;
  c.lineBreakMode = NSLineBreakByClipping;
  c.maximumNumberOfLines = 0;
  NSLayoutManager *lm = [NSLayoutManager new];
  lm.usesFontLeading = NO;
  [lm addTextContainer:c];
  NSTextStorage *ts = [[NSTextStorage alloc] initWithAttributedString:self.text];
  [ts addLayoutManager:lm];
  [lm ensureLayoutForTextContainer:c];
  *containerOut = c;
  objc_setAssociatedObject(self, "ts", ts, OBJC_ASSOCIATION_RETAIN);
  return lm;
}
- (void)drawRect:(CGRect)rect {
  NSTextContainer *c;
  NSLayoutManager *lm = [self layout:&c];
  NSRange r = [lm glyphRangeForTextContainer:c];
  CGContextRef ctx = UIGraphicsGetCurrentContext();
  [gOut appendFormat:@"ctm %@\n", NSStringFromCGAffineTransform(CGContextGetCTM(ctx))];
  [lm drawBackgroundForGlyphRange:r atPoint:CGPointZero];
  [lm drawGlyphsForGlyphRange:r atPoint:CGPointZero];
}
@end
static UIFont *fontFor(NSString *name, CGFloat size) {
  if ([name hasPrefix:@"system-"]) return [UIFont systemFontOfSize:size weight:[[name substringFromIndex:7] doubleValue]];
  NSString *path = [[NSBundle mainBundle] pathForResource:name ofType:nil];
  CGDataProviderRef p = CGDataProviderCreateWithURL((__bridge CFURLRef)[NSURL fileURLWithPath:path]);
  CGFontRef cg = CGFontCreateWithDataProvider(p);
  CTFontManagerRegisterGraphicsFont(cg, NULL);
  NSString *ps = (__bridge_transfer NSString *)CGFontCopyPostScriptName(cg);
  return [UIFont fontWithName:ps size:size];
}

@interface App : UIResponder <UIApplicationDelegate, UIWindowSceneDelegate>
@property(nonatomic) UIWindow *window;
@end
@implementation App
- (BOOL)application:(UIApplication *)a didFinishLaunchingWithOptions:(NSDictionary *)o {
  return YES;
}
- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session
                              options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *c = [[UISceneConfiguration alloc] initWithName:@"probe" sessionRole:session.role];
  c.delegateClass = [App class];
  return c;
}
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  gOut = [NSMutableString string];
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  UIViewController *vc = [UIViewController new];
  vc.view.backgroundColor = UIColor.blackColor;
  self.window.rootViewController = vc;
  [self.window makeKeyAndVisible];
  NSArray<NSString *> *args = NSProcessInfo.processInfo.arguments;
  // Cases: "font|size|text(\\u escapes)|x|y" separated by ";;".
  NSString *spec = args.count > 2 ? args[2] : @"";
  CGFloat s = UIScreen.mainScreen.scale;
  [gOut appendFormat:@"scale %g\n", s];
  NSMutableArray *views = [NSMutableArray array];
  for (NSString *one in [spec componentsSeparatedByString:@";;"]) {
    NSArray *f = [one componentsSeparatedByString:@"|"];
    if (f.count < 5) continue;
    UIFont *font = fontFor(f[0], [f[1] doubleValue]);
    NSMutableString *text = [NSMutableString string];
    NSString *raw = f[2];
    for (NSUInteger i = 0; i < raw.length; i++) {
      if ([raw characterAtIndex:i] == '\\' && i + 5 < raw.length + 0 && [raw characterAtIndex:i + 1] == 'u') {
        unichar u = (unichar)strtoul([[raw substringWithRange:NSMakeRange(i + 2, 4)] UTF8String], NULL, 16);
        [text appendString:[NSString stringWithCharacters:&u length:1]];
        i += 5;
      } else {
        [text appendFormat:@"%C", [raw characterAtIndex:i]];
      }
    }
    NSAttributedString *as = [[NSAttributedString alloc] initWithString:text attributes:@{NSFontAttributeName : font, NSForegroundColorAttributeName : UIColor.whiteColor}];
    CGRect b = [as boundingRectWithSize:CGSizeMake(10000, 10000) options:NSStringDrawingUsesLineFragmentOrigin context:nil];
    // RN rounds the measured box up to whole device pixels.
    CGSize size = CGSizeMake(ceil(b.size.width * s) / s, ceil(b.size.height * s) / s);
    TextView *v = [[TextView alloc] initWithFrame:CGRectMake([f[3] doubleValue], [f[4] doubleValue], size.width, size.height)];
    v.opaque = NO;
    v.backgroundColor = UIColor.clearColor;
    v.contentMode = UIViewContentModeRedraw;
    v.text = as;
    [vc.view addSubview:v];
    [views addObject:@[ v, one, font ]];
  }
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1500 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
    for (NSArray *e in views) {
      TextView *v = e[0];
      UIFont *font = e[2];
      [gOut appendFormat:@"case %@\n", e[1]];
      CTFontRef ct = (__bridge CTFontRef)font;
      [gOut appendFormat:@"font %@ size %.6f ascender %.6f descender %.6f leading %.6f lineHeight %.6f ct %.6f %.6f %.6f upem %u\n", font.fontName, font.pointSize, font.ascender, font.descender, font.leading, font.lineHeight, CTFontGetAscent(ct), CTFontGetDescent(ct), CTFontGetLeading(ct), CTFontGetUnitsPerEm(ct)];
      [gOut appendFormat:@"frame %.6f %.6f %.6f %.6f\n", v.frame.origin.x, v.frame.origin.y, v.frame.size.width, v.frame.size.height];
      NSTextContainer *c;
      NSLayoutManager *lm = [v layout:&c];
      NSRange gr = [lm glyphRangeForTextContainer:c];
      NSRange eff;
      CGRect frag = [lm lineFragmentRectForGlyphAtIndex:0 effectiveRange:&eff];
      CGRect used = [lm lineFragmentUsedRectForGlyphAtIndex:0 effectiveRange:NULL];
      [gOut appendFormat:@"fragment %.6f %.6f %.6f %.6f used %.6f %.6f %.6f %.6f\n", frag.origin.x, frag.origin.y, frag.size.width, frag.size.height, used.origin.x, used.origin.y, used.size.width, used.size.height];
      NSMutableString *g = [NSMutableString stringWithString:@"glyphs"];
      for (NSUInteger i = gr.location; i < NSMaxRange(gr); i++) {
        CGPoint p = [lm locationForGlyphAtIndex:i];
        [g appendFormat:@" %u:%.6f,%.6f", (unsigned)[lm CGGlyphAtIndex:i], p.x, p.y];
      }
      [gOut appendFormat:@"%@\n", g];
      // The view's own pixels: its layer rendered at the screen's scale into a transparent bitmap.
      size_t w = (size_t)llround(v.bounds.size.width * s), h = (size_t)llround(v.bounds.size.height * s);
      uint8_t *px = calloc(w * h * 4, 1);
      CGColorSpaceRef cs = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
      CGContextRef ctx = CGBitmapContextCreate(px, w, h, 8, w * 4, cs, (CGBitmapInfo)kCGImageAlphaPremultipliedLast);
      CGContextTranslateCTM(ctx, 0, h);
      CGContextScaleCTM(ctx, s, -s);
      [v.layer renderInContext:ctx];
      [gOut appendFormat:@"pixels %zu %zu\n", w, h];
      NSMutableString *hex = [NSMutableString stringWithCapacity:w * h * 2];
      for (size_t i = 0; i < w * h; i++) [hex appendFormat:@"%02x", px[i * 4 + 3]];
      [gOut appendFormat:@"%@\n", hex];
      CGContextRelease(ctx);
      CGColorSpaceRelease(cs);
      free(px);
    }
    NSString *doc = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    [gOut writeToFile:[doc stringByAppendingPathComponent:@"text.txt"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
  });
}
@end

int main(int argc, char **argv) {
  @autoreleasepool {
    return UIApplicationMain(argc, argv, nil, NSStringFromClass([App class]));
  }
}
