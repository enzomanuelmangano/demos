// RNGH's iOS pan on a view that RN transforms from the pan's own translation (swipe-cards):
// a 378 × 513 card, layer.transform = rotate(θ) · translate(tx, ty) about its centre (RN's
// [rotate, translateX, translateY] order), θ = clamp(tx / (w / 3)) × π / 20. Logs, per pan event,
// the finger in the window, translationInView:window (what RNGH reports), and the card's centre.
// `-mode fixed` leaves the card where it is (the translation with no feedback). Each raw touch
// the card receives is logged too ("touch", time in ms from touch-down), so which move began the
// pan is visible.
#import <UIKit/UIKit.h>
static NSMutableString *gLog; static double gT0;
@interface Card : UIView @end
@implementation Card
- (void)touchesBegan:(NSSet *)t withEvent:(UIEvent *)e { UITouch *u = t.anyObject; gT0 = u.timestamp; CGPoint p = [u locationInView:nil];
  [gLog appendFormat:@"down %.2f %.2f\n", p.x, p.y]; [super touchesBegan:t withEvent:e]; }
- (void)touchesMoved:(NSSet *)t withEvent:(UIEvent *)e { UITouch *u = t.anyObject; CGPoint p = [u locationInView:nil];
  [gLog appendFormat:@"touch %.1f %.2f %.2f\n", (u.timestamp - gT0) * 1000, p.x, p.y]; [super touchesMoved:t withEvent:e]; }
@end
@interface D : UIResponder <UIApplicationDelegate, UIWindowSceneDelegate>
@property UIWindow *window; @property UIView *card; @property NSMutableString *log; @property BOOL fixed; @end
@implementation D
- (UISceneConfiguration *)application:(UIApplication *)app configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *c = [[UISceneConfiguration alloc] initWithName:@"p" sessionRole:session.role]; c.delegateClass = [D class]; return c; }
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  self.fixed = [[NSUserDefaults standardUserDefaults] stringForKey:@"mode"] != nil;
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  UIViewController *vc = [UIViewController new]; self.window.rootViewController = vc;
  vc.view.backgroundColor = UIColor.blackColor;
  CGSize s = vc.view.bounds.size;
  self.card = [[Card alloc] initWithFrame:CGRectMake((s.width - 378) / 2, 200, 378, 513)];
  self.card.backgroundColor = UIColor.systemTealColor;
  [vc.view addSubview:self.card];
  [self.card addGestureRecognizer:[[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(pan:)]];
  [self.window makeKeyAndVisible]; self.log = [NSMutableString string]; gLog = self.log; }
- (void)pan:(UIPanGestureRecognizer *)p {
  UIWindow *w = self.card.window;
  CGPoint t = [p translationInView:w];
  CGPoint f = [p locationInView:w];
  CGPoint v = [p velocityInView:w];
  if (!self.fixed) {
    double third = w.bounds.size.width / 3;
    double n = MAX(-1, MIN(1, t.x / third));
    CATransform3D m = CATransform3DTranslate(CATransform3DMakeRotation(n * M_PI / 20, 0, 0, 1), t.x, t.y, 0);
    if (p.state == UIGestureRecognizerStateEnded || p.state == UIGestureRecognizerStateCancelled) m = CATransform3DIdentity;
    self.card.layer.transform = m;
  }
  [self.log appendFormat:@"%ld finger %.2f %.2f trans %.2f %.2f at %.1f vel %.1f %.1f\n", (long)p.state, f.x, f.y, t.x, t.y, (CACurrentMediaTime() - gT0) * 1000, v.x, v.y];
  if (p.state == UIGestureRecognizerStateEnded || p.state == UIGestureRecognizerStateCancelled) {
    [self.log appendString:@"end\n"];
    [self.log writeToFile:@"/tmp/pan-probe/log.txt" atomically:YES encoding:NSUTF8StringEncoding error:nil];
  }
}
@end
int main(int c, char **v) { @autoreleasepool { return UIApplicationMain(c, v, nil, NSStringFromClass([D class])); } }
