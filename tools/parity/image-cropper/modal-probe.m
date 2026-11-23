// Presents a full-screen cover-vertical controller (RN Modal presentationStyle fullScreen,
// animationType slide: RCTModalHostViewComponentView's UIModalPresentationFullScreen +
// UIModalTransitionStyleCoverVertical, animated) and dismisses it, on UIKit for Mac (Mac
// Catalyst: UIKit's own transition code); logs every CAAnimation UIKit adds (class, key path,
// from/to, CASpringAnimation's mass, stiffness, damping, duration) and the presented view's y
// per display frame (`T <media time> <target time> <y>`). Measured (macOS 27.0.1): present and
// dismiss are each an additive `position` CASpringAnimation, mass 3, stiffness 1000, damping
// 500, initialVelocity 0, duration 0.5, from (0, ±window height) to 0; Core Animation runs it
// critically damped (ζ = 4.56 clamped to 1, ω = √(k / m)): the y samples follow
// H (1 + ωt) e^(−ωt) to 1e-4 and jump to 0 at 0.5 s.
//   ./build-modal.sh && /tmp/image-cropper-modal-probe/Probe.app/Contents/MacOS/Probe
#import <UIKit/UIKit.h>
@interface D : UIResponder <UIApplicationDelegate, UIWindowSceneDelegate>
@property (nonatomic, strong) UIWindow *window; @property UIViewController *m; @property CADisplayLink *l; @property double t0; @end
static int found;
static void dump(CALayer *layer, int depth) {
  for (NSString *k in layer.animationKeys) {
    CAAnimation *a = [layer animationForKey:k];
    NSMutableString *s = [NSMutableString stringWithFormat:@"%*s%@ key=%@ class=%@ dur=%.6f begin=%.6f speed=%.3f", depth*2, "", layer.class, k, a.class, a.duration, a.beginTime, a.speed];
    if ([a isKindOfClass:CAPropertyAnimation.class]) [s appendFormat:@" path=%@ additive=%d", ((CAPropertyAnimation *)a).keyPath, ((CAPropertyAnimation *)a).additive];
    if ([a isKindOfClass:CABasicAnimation.class]) { CABasicAnimation *b = (id)a; [s appendFormat:@" from=%@ to=%@ by=%@", b.fromValue, b.toValue, b.byValue]; }
    if ([a isKindOfClass:CASpringAnimation.class]) { CASpringAnimation *sp = (id)a; [s appendFormat:@" mass=%.6f stiffness=%.6f damping=%.6f v0=%.6f settle=%.6f", sp.mass, sp.stiffness, sp.damping, sp.initialVelocity, sp.settlingDuration]; }
    if (a.timingFunction) { float c[4][2]; for (int i = 0; i < 4; i++) [a.timingFunction getControlPointAtIndex:i values:c[i]]; [s appendFormat:@" tf=(%.6f,%.6f,%.6f,%.6f)", c[1][0], c[1][1], c[2][0], c[2][1]]; }
    NSLog(@"ANIM %@ now=%.6f", s, CACurrentMediaTime()); found++;
  }
  for (CALayer *c in layer.sublayers) dump(c, depth + 1);
}
@implementation D
- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *c = [[UISceneConfiguration alloc] initWithName:@"p" sessionRole:session.role]; c.delegateClass = [D class]; return c; }
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  UIViewController *vc = [UIViewController new]; vc.view.backgroundColor = UIColor.blackColor; self.window.rootViewController = vc;
  [self.window makeKeyAndVisible];
  self.l = [CADisplayLink displayLinkWithTarget:self selector:@selector(tick:)];
  [self.l addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2e9), dispatch_get_main_queue(), ^{ [self present]; }); }
- (void)present {
  self.m = [UIViewController new]; self.m.view.backgroundColor = UIColor.whiteColor;
  self.m.modalPresentationStyle = UIModalPresentationFullScreen; self.m.modalTransitionStyle = UIModalTransitionStyleCoverVertical;
  NSLog(@"PRESENT bounds %@", NSStringFromCGRect(self.window.bounds));
  self.t0 = CACurrentMediaTime();
  [self.window.rootViewController presentViewController:self.m animated:YES completion:^{ NSLog(@"PRESENTED %.4f", (CACurrentMediaTime() - self.t0) * 1000);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1e9), dispatch_get_main_queue(), ^{ [self dismiss]; }); }];
  dispatch_async(dispatch_get_main_queue(), ^{ NSLog(@"DUMP after present"); dump(self.window.layer, 0); });
  [CATransaction setCompletionBlock:^{}];
}
- (void)dismiss {
  self.t0 = CACurrentMediaTime();
  [self.m dismissViewControllerAnimated:YES completion:^{ NSLog(@"DISMISSED %.4f", (CACurrentMediaTime() - self.t0) * 1000);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 5e8), dispatch_get_main_queue(), ^{ exit(0); }); }];
  dispatch_async(dispatch_get_main_queue(), ^{ NSLog(@"DUMP after dismiss"); dump(self.window.layer, 0); });
}
- (void)tick:(CADisplayLink *)l { static int phase = -1; int ph = self.m.isBeingDismissed ? 2 : (self.m.isBeingPresented ? 1 : 0); if (ph != phase) { phase = ph; found = 0; } if (ph && !found) dump(self.window.layer, 0); if (self.t0 > 0 && self.m.view.window) { CALayer *p = self.m.view.layer.presentationLayer; CGRect r = [self.m.view.layer.presentationLayer convertRect:p.bounds toLayer:self.window.layer.presentationLayer]; NSLog(@"T %.6f %.6f %.4f", CACurrentMediaTime(), l.targetTimestamp, r.origin.y); } }
@end
int main(int c, char **v) { @autoreleasepool { return UIApplicationMain(c, v, nil, NSStringFromClass([D class])); } }
