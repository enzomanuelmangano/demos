// UISwipeGestureRecognizer's defaults and code, read on the Mac (no simulator): UIKitCore is the
// same source for Mac Catalyst. Prints a fresh recognizer's ivars (the thresholds RNGH 3.3's
// iOS Fling, a UISwipeGestureRecognizer, runs with); `./build.sh dis` also disassembles
// touchesMoved: and _checkForSwipeWithDelta:… with lldb (ivar offsets: the `offs` lines).
// gesture-handler's FlingGesture (exact/demos/packages/gesture-handler) is that code.
// Read 2026-11 (macOS 27 SDK): maximumDuration 0.5, minimumPrimaryMovement 50,
// maximumPrimaryMovement FLT_MAX, minimumSecondaryMovement 0, maximumSecondaryMovement 50,
// maximumOppositeMovement 0, minimumPrimaryMovementRate 0, rateOfMinimumMovementDecay 0.06,
// rateOfMaximumMovementDecay 0.02, numberOfTouchesRequired 1.
#import <UIKit/UIKit.h>
#import <objc/runtime.h>
int main(int argc, char **argv) {
  @autoreleasepool {
    UISwipeGestureRecognizer *g = [[UISwipeGestureRecognizer alloc] initWithTarget:nil action:nil];
    unsigned n = 0;
    Ivar *iv = class_copyIvarList([UISwipeGestureRecognizer class], &n);
    for (unsigned i = 0; i < n; i++) {
      const char *t = ivar_getTypeEncoding(iv[i]);
      ptrdiff_t off = ivar_getOffset(iv[i]);
      char *p = (char *)(__bridge void *)g + off;
      printf("offs %td %s", off, ivar_getName(iv[i]));
      if (t[0] == 'd') printf(" = %.17g", *(double *)p);
      else if (t[0] == 'Q' || t[0] == 'q') printf(" = %lld", *(long long *)p);
      printf("\n");
    }
    free(iv);
  }
}
