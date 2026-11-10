// FancyBorderButton's border image (src/animations/image-cropper/components/border-button:
// borderWidth 1, white, borderRadius 8, no background, not clipping) as React Native 0.88 draws
// it: RCTViewComponentView puts RCTGetBorderImage's stretchable image in a border layer
// (RCTBorderDrawing.m, compiled here as is but for the renderer's scale, forced to the
// iPhone's 3). Run on this Mac's CoreGraphics through UIKit for Mac (Mac Catalyst), the
// same rasteriser as iOS's. Writes the image's alpha (premultiplied white: every channel is
// the coverage) row by row to argv[1], and prints its size and cap insets.
#import <UIKit/UIKit.h>
#import "RCTBorderDrawing.h"
CGFloat RCTRoundPixelValue(CGFloat v) { return round(v * 3) / 3; }
int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc < 2) { fprintf(stderr, "usage: border-image out.a8\n"); return 1; }
    RCTCornerRadii radii = {8, 8, 8, 8, 8, 8, 8, 8};
    RCTBorderColors colors = {UIColor.whiteColor, UIColor.whiteColor, UIColor.whiteColor, UIColor.whiteColor};
    // Any button size: the image is the stretchable 17 x 17 pt one (caps 8 pt).
    UIImage *img = RCTGetBorderImage(RCTBorderStyleSolid, CGSizeMake(100, 51), radii,
                                     UIEdgeInsetsMake(1, 1, 1, 1), colors, UIColor.clearColor, NO);
    CGImageRef cg = img.CGImage;
    size_t pw = CGImageGetWidth(cg), ph = CGImageGetHeight(cg), bpp = CGImageGetBitsPerPixel(cg) / 8;
    printf("size %g x %g pt at %g: %zu x %zu px, caps %g %g %g %g, %zu bytes a pixel\n", img.size.width,
           img.size.height, img.scale, pw, ph, img.capInsets.top, img.capInsets.left, img.capInsets.bottom,
           img.capInsets.right, bpp);
    CFDataRef data = CGDataProviderCopyData(CGImageGetDataProvider(cg));
    const uint8_t *px = CFDataGetBytePtr(data);
    size_t bpr = CGImageGetBytesPerRow(cg);
    FILE *out = fopen(argv[1], "wb");
    // The alpha is each pixel's last byte (gray + alpha, or RGBA, premultiplied last).
    for (size_t y = 0; y < ph; y++)
      for (size_t x = 0; x < pw; x++) fputc(px[y * bpr + x * bpp + bpp - 1], out);
    fclose(out);
    CFRelease(data);
  }
  return 0;
}
