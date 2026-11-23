// UIScrollView paging on UIKit for Mac (Mac Catalyst: UIKit's own scroll view code): a 420 pt
// wide pagingEnabled scroll view of 4 pages (github-onboarding's FlatList on the iPhone Air),
// driven by its own pan recognizer with scripted touches: the recognizer's state, translation
// and velocity are replaced (method_setImplementation on its class) and -[UIScrollView
// handlePan:] is called once per display frame, as UIKit calls it for a real pan. Logs the
// content offset per display frame from the lift (`F <ms since lift> <offset>`), the scroll
// view's willEndDragging target, and setContentOffset:animated: (`A <ms> <offset>`).
//   ./build-paging.sh && /tmp/go-paging-probe/Probe.app/Contents/MacOS/Probe <drag pt> <frames> <lift velocity pt/s> [<from page>]
//   (drag > 0 moves the content left, toward the next page; `A` mode: drag 0 frames 0 v <to page>)
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

static UIGestureRecognizerState gState = UIGestureRecognizerStatePossible;
static CGPoint gTranslation, gVelocity;
static UIGestureRecognizerState fakeState(id self, SEL _cmd) { return gState; }
static CGPoint fakeTranslation(id self, SEL _cmd, UIView *v) { return gTranslation; }
static CGPoint fakeVelocity(id self, SEL _cmd, UIView *v) { return gVelocity; }

@interface D : UIResponder <UIApplicationDelegate, UIWindowSceneDelegate, UIScrollViewDelegate>
@property (nonatomic, strong) UIWindow *window;
@property UIScrollView *sv; @property CADisplayLink *link;
@property int frame; @property double lift; @property double last; @property double still;
@end

static double gDrag, gV, gW = 420; static int gFrames, gFrom;

@implementation D
- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *c = [[UISceneConfiguration alloc] initWithName:@"p" sessionRole:session.role]; c.delegateClass = [D class]; return c; }
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  UIViewController *vc = [UIViewController new]; vc.view.backgroundColor = UIColor.whiteColor; self.window.rootViewController = vc;
  self.sv = [[UIScrollView alloc] initWithFrame:CGRectMake(0, 0, gW, 300)];
  self.sv.pagingEnabled = YES;
  self.sv.contentSize = CGSizeMake(gW * 4, 300);
  self.sv.delegate = self;
  for (int i = 0; i < 4; i++) {
    UIView *p = [[UIView alloc] initWithFrame:CGRectMake(i * gW + 20, 20, 380, 260)];
    p.backgroundColor = i % 2 ? UIColor.systemOrangeColor : UIColor.systemBlueColor; [self.sv addSubview:p];
  }
  [vc.view addSubview:self.sv];
  [self.window makeKeyAndVisible];
  self.sv.contentOffset = CGPointMake(gFrom * gW, 0);
  NSLog(@"decelerationRate %.6f", self.sv.decelerationRate);
  UIPanGestureRecognizer *pan = self.sv.panGestureRecognizer;
  Class k = object_getClass(pan);
  NSLog(@"pan class %@", k);
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)1e9), dispatch_get_main_queue(), ^{
    class_replaceMethod(k, @selector(state), (IMP)fakeState, "q@:");
    class_replaceMethod(k, @selector(translationInView:), (IMP)fakeTranslation, "{CGPoint=dd}@:@");
    class_replaceMethod(k, @selector(velocityInView:), (IMP)fakeVelocity, "{CGPoint=dd}@:@");
    // UIKit tracks the content's velocity from real touches' timestamps, which scripted states
    // don't have: _endPanNormal: is given the lift's velocity in that ivar (pt/ms).
    Method end = class_getInstanceMethod(UIScrollView.class, NSSelectorFromString(@"_endPanNormal:"));
    IMP original = method_getImplementation(end);
    D *me = self;
    method_setImplementation(end, imp_implementationWithBlock(^(UIScrollView *sv, BOOL normal) {
      [me setIvar:"_horizontalVelocity" to:gV / 1000];
      ((void (*)(id, SEL, BOOL))original)(sv, NSSelectorFromString(@"_endPanNormal:"), normal);
    }));
    self.frame = -1; self.lift = NAN; self.last = NAN;
    self.link = [CADisplayLink displayLinkWithTarget:self selector:@selector(tick:)];
    [self.link addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
  });
}
- (void)scrollViewWillEndDragging:(UIScrollView *)sv withVelocity:(CGPoint)v targetContentOffset:(inout CGPoint *)t {
  NSLog(@"willEnd v %.6f target %.4f off %.4f", v.x, t->x, sv.contentOffset.x);
}
- (double)ivar:(const char *)name {
  Ivar iv = class_getInstanceVariable(UIScrollView.class, name);
  return *(double *)((char *)(__bridge void *)self.sv + ivar_getOffset(iv));
}
- (void)setIvar:(const char *)name to:(double)v {
  Ivar iv = class_getInstanceVariable(UIScrollView.class, name);
  *(double *)((char *)(__bridge void *)self.sv + ivar_getOffset(iv)) = v;
}
- (double)raw {
  Ivar iv = class_getInstanceVariable(UIScrollView.class, "_lastSetContentOffsetUnrounded");
  return ((CGPoint *)((char *)(__bridge void *)self.sv + ivar_getOffset(iv)))->x;
}
- (double)target {
  Ivar iv = class_getInstanceVariable(UIScrollView.class, "_pageDecelerationTarget");
  return ((CGPoint *)((char *)(__bridge void *)self.sv + ivar_getOffset(iv)))->x;
}
- (void)tick:(CADisplayLink *)l {
  self.frame++;
  double x = self.sv.contentOffset.x;
  UIScrollView *sv = self.sv;
  if (gFrames == 0 && gDrag == 0) {
    // setContentOffset:animated: from page gFrom to page gV.
    if (self.frame == 1) { self.lift = l.timestamp; [sv setContentOffset:CGPointMake(gV * gW, 0) animated:YES]; }
    if (!isnan(self.lift)) NSLog(@"A %.3f %.4f", (l.timestamp - self.lift) * 1000, x);
    if (self.frame > 60) exit(0);
    return;
  }
  if (self.frame == 0) {
    gState = UIGestureRecognizerStateBegan; gTranslation = CGPointMake(0, 0); gVelocity = CGPointMake(0, 0);
    [sv performSelector:@selector(handlePan:) withObject:sv.panGestureRecognizer];
  } else if (self.frame <= gFrames) {
    gState = UIGestureRecognizerStateChanged;
    gTranslation = CGPointMake(-gDrag * self.frame / gFrames, 0);
    gVelocity = CGPointMake(-gV, 0);
    [sv performSelector:@selector(handlePan:) withObject:sv.panGestureRecognizer];
    NSLog(@"D %d %.4f", self.frame, sv.contentOffset.x);
  } else if (self.frame == gFrames + 1) {
    gState = UIGestureRecognizerStateEnded; gVelocity = CGPointMake(-gV, 0);
    [sv performSelector:@selector(handlePan:) withObject:sv.panGestureRecognizer];
    self.lift = l.timestamp;
    NSLog(@"lift at %.4f dragging %d decelerating %d raw %.6f pull %.17g friction %.17g target %.4f v %.9f upd %.6f ts %.6f", sv.contentOffset.x, sv.isDragging, sv.isDecelerating, [self raw], [self ivar:"_pagingSpringPull"], [self ivar:"_pagingFriction"], [self target], [self ivar:"_horizontalVelocity"], [self ivar:"_lastUpdateTime"], l.timestamp);
    gState = UIGestureRecognizerStatePossible;
  } else {
    NSLog(@"F %.3f %.4f decel %d raw %.6f v %.9f ts %.6f upd %.6f", (l.timestamp - self.lift) * 1000, x, sv.isDecelerating, [self raw], [self ivar:"_horizontalVelocity"], l.timestamp, [self ivar:"_lastUpdateTime"]);
    if (x == self.last) { if (++self.still > 30) exit(0); } else self.still = 0;
    self.last = x;
  }
}
@end
int main(int c, char **v) {
  gDrag = c > 1 ? atof(v[1]) : 100; gFrames = c > 2 ? atoi(v[2]) : 10; gV = c > 3 ? atof(v[3]) : 0; gFrom = c > 4 ? atoi(v[4]) : 0; if (getenv("W")) gW = atof(getenv("W"));
  @autoreleasepool { return UIApplicationMain(1, v, nil, NSStringFromClass([D class])); }
}
