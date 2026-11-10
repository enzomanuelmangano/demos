// Scroll probe: a bare UIScrollView on the iOS Simulator, logging what UIKit does per display
// frame and per touch, to measure the rubber band, the bounce, the deceleration and the release
// rules the demos' Rust UIScrollView (exact/demos/gpu/src/ui_scroll.rs) models.
//   ./build.sh; xcrun simctl install <sim> /tmp/scroll-probe/ScrollProbe.app
//   xcrun simctl launch <sim> com.reactiive.scrollprobe [-content <× port width>] [-offset <x>]
//     [-rate fast|normal] [-snap <interval> [-current YES]]
// Documents/log.txt (written once nothing has moved for 1 s): "<t> touch <phase> <x>" per touch,
// "<t> off <contentOffset.x> drag <0|1> decel <0|1> frame <display link timestamp>" per display
// frame while it changes, "<t> willEnd v <pt/ms> target <x> off <x>", "<t> snapTarget <x>" (the
// target RN's snapToInterval rule sets; -current is disableIntervalMomentum).
// Drive it with argent gesture-custom at y 0.6 (the scroll is the band under the screen's middle).
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>

static NSMutableString *gLog;
static NSString *gPath;
static double gLastChange;
static NSUInteger gWritten;
static void plog(NSString *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  NSString *s = [[NSString alloc] initWithFormat:fmt arguments:ap]; va_end(ap);
  [gLog appendFormat:@"%.4f %@\n", CACurrentMediaTime(), s];
}

@interface Win : UIWindow @end
@implementation Win
- (void)sendEvent:(UIEvent *)e {
  for (UITouch *t in e.allTouches) {
    static const char *ph[] = {"began", "moved", "stationary", "ended", "cancelled"};
    gLastChange = CACurrentMediaTime();
    plog(@"touch %s %.3f ts %.4f", ph[t.phase < 5 ? t.phase : 4], [t locationInView:self].x, t.timestamp);
  }
  [super sendEvent:e];
}
@end

@interface VC : UIViewController <UIScrollViewDelegate>
@property UIScrollView *sv; @property CADisplayLink *link; @property double last;
@end
@implementation VC
- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = UIColor.whiteColor;
  NSUserDefaults *d = NSUserDefaults.standardUserDefaults;
  double content = [d doubleForKey:@"content"] ?: 1.0;
  CGRect b = UIScreen.mainScreen.bounds;
  self.sv = [[UIScrollView alloc] initWithFrame:CGRectMake(0, b.size.height / 2, b.size.width, 200)];
  self.sv.alwaysBounceHorizontal = YES;
  self.sv.showsHorizontalScrollIndicator = NO;
  self.sv.contentSize = CGSizeMake(b.size.width * content, 200);
  if ([[d stringForKey:@"rate"] isEqual:@"fast"]) self.sv.decelerationRate = UIScrollViewDecelerationRateFast;
  self.sv.delegate = self;
  for (int i = 0; i < (int)(content * 4); i++) {
    UIView *v = [[UIView alloc] initWithFrame:CGRectMake(i * b.size.width / 4 + 10, 50, b.size.width / 4 - 20, 100)];
    UILabel *l = [[UILabel alloc] initWithFrame:v.bounds]; l.text = [NSString stringWithFormat:@"%d", i];
    l.textAlignment = NSTextAlignmentCenter; [v addSubview:l];
    v.backgroundColor = i % 2 ? UIColor.systemOrangeColor : UIColor.systemBlueColor;
    [self.sv addSubview:v];
  }
  [self.view addSubview:self.sv];
  double off = [d doubleForKey:@"offset"];
  if (off) self.sv.contentOffset = CGPointMake(off, 0);
  self.link = [CADisplayLink displayLinkWithTarget:self selector:@selector(tick:)];
  [self.link addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
  self.last = NAN;
  // Written only once nothing has moved for a second, so no write stalls a measured frame.
  [NSTimer scheduledTimerWithTimeInterval:0.5 repeats:YES block:^(NSTimer *t) {
    if (CACurrentMediaTime() - gLastChange > 1.0 && gLog.length != gWritten) {
      [gLog writeToFile:gPath atomically:YES encoding:NSUTF8StringEncoding error:nil];
      gWritten = gLog.length;
    }
  }];
}
- (void)tick:(CADisplayLink *)l {
  double x = self.sv.contentOffset.x;
  if (x != self.last) {
    plog(@"off %.4f drag %d decel %d frame %.4f", x, self.sv.isDragging, self.sv.isDecelerating, l.timestamp);
    gLastChange = CACurrentMediaTime();
  }
  self.last = x;
}
- (void)scrollViewWillBeginDragging:(UIScrollView *)s { plog(@"beginDrag off %.4f", s.contentOffset.x); }
- (void)scrollViewWillEndDragging:(UIScrollView *)s withVelocity:(CGPoint)v targetContentOffset:(inout CGPoint *)t {
  plog(@"willEnd v %.4f target %.4f off %.4f", v.x, t->x, s.contentOffset.x);
  // -snap <interval>: RCTEnhancedScrollView's snapToInterval rule (snapToAlignment start).
  double interval = [NSUserDefaults.standardUserDefaults doubleForKey:@"snap"];
  if (interval > 0) {
    BOOL current = [NSUserDefaults.standardUserDefaults boolForKey:@"current"];
    double f = (current ? s.contentOffset.x : t->x) / interval;
    double i = v.x > 0 ? ceil(f) : v.x < 0 ? floor(f) : round(f);
    t->x = i * interval;
    plog(@"snapTarget %.4f", t->x);
  }
}
- (void)scrollViewDidEndDecelerating:(UIScrollView *)s { plog(@"endDecel off %.4f", s.contentOffset.x); }
@end

@interface App : UIResponder <UIApplicationDelegate, UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end
@implementation App
- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session
                              options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *c = [[UISceneConfiguration alloc] initWithName:@"probe" sessionRole:session.role];
  c.delegateClass = [App class];
  return c;
}
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  gLog = [NSMutableString string];
  gPath = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES)[0] stringByAppendingPathComponent:@"log.txt"];
  self.window = [[Win alloc] initWithWindowScene:(UIWindowScene *)scene];
  self.window.rootViewController = [VC new];
  [self.window makeKeyAndVisible];
}
@end

int main(int argc, char **argv) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(App.class)); }
}
