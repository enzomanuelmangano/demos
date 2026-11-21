// Logs UIScrollView setContentOffset:animated: per display frame.
#import <UIKit/UIKit.h>
@interface D : UIResponder <UIApplicationDelegate, UIWindowSceneDelegate>
@property UIWindow *window; @property UIScrollView *s; @property CADisplayLink *l;
@property NSMutableString *log; @property double t0; @property int run; @end
static double dists[] = {100, 420, 932, -300, 2000};
@implementation D
- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *c = [[UISceneConfiguration alloc] initWithName:@"p" sessionRole:session.role]; c.delegateClass = [D class]; return c; }
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  UIViewController *vc = [UIViewController new]; self.window.rootViewController = vc;
  self.s = [[UIScrollView alloc] initWithFrame:vc.view.bounds];
  self.s.contentSize = CGSizeMake(10000, 100); [vc.view addSubview:self.s];
  self.s.contentOffset = CGPointMake(3000, 0);
  [self.window makeKeyAndVisible]; self.log = [NSMutableString string];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1e9), dispatch_get_main_queue(), ^{ [self next]; });
  self.l = [CADisplayLink displayLinkWithTarget:self selector:@selector(tick:)];
  self.l.preferredFrameRateRange = CAFrameRateRangeMake(60, 120, 120);
  [self.l addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes]; }
- (void)next {
  if (self.run >= 5) { NSString *p = @"/tmp/scroll-probe/log.txt";
    [self.log writeToFile:p atomically:YES encoding:NSUTF8StringEncoding error:nil]; NSLog(@"PROBE DONE %@", p); return; }
  double d = dists[self.run++]; self.s.contentOffset = CGPointMake(3000, 0);
  [self.log appendFormat:@"run %g\n", d]; self.t0 = CACurrentMediaTime();
  [self.s setContentOffset:CGPointMake(3000 + d, 0) animated:YES];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1.5e9), dispatch_get_main_queue(), ^{ [self next]; }); }
- (void)tick:(CADisplayLink *)l { if (self.t0 > 0) [self.log appendFormat:@"%.4f %.4f %.4f\n", (CACurrentMediaTime() - self.t0) * 1000, (l.targetTimestamp - self.t0) * 1000, self.s.contentOffset.x - 3000]; }
@end
int main(int c, char **v) { @autoreleasepool { return UIApplicationMain(c, v, nil, NSStringFromClass([D class])); } }
