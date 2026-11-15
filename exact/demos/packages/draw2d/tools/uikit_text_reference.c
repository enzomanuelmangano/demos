// UIKit's drawing of an RN <Text>, reproduced with CoreGraphics: glyphs drawn as
// NSLayoutManager drawGlyphsForGlyphRange does into a text view's backing store (a flipped,
// scaled context, the text matrix flipped, positions in points). With flags PQA (subpixel
// positioning and quantization on, antialiasing, no smoothing) its alpha equals the iOS
// Simulator's own pixels byte for byte (exact/parity-tools/text-probe, every case measured),
// so the skia package's UIKit text is tested against it (src/glyphs.rs, uikit_text_is_coregraphics).
// uikit_text_reference <font file | sfui:<path>:<wght>> <size> <w px> <h px> <scale> <flags>
//   <glyph:x,y (points)>...   prints the alpha in hex.
// flags: P subpixel positioning, Q subpixel quantization, A antialias, S smoothing,
//   N leave the text matrix (and positions) unflipped, F no flipped scaled CTM.
#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <CoreText/CoreText.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main(int argc, char **argv) {
  const char *fp = argv[1]; double size = atof(argv[2]); int w = atoi(argv[3]), h = atoi(argv[4]); double s = atof(argv[5]); const char *flags = argv[6];
  CTFontRef font;
  double wght = 0;
  char path[4096];
  if (strncmp(fp, "sfui:", 5) == 0) { const char *c = strrchr(fp, ':'); snprintf(path, c - fp - 4, "%s", fp + 5); wght = atof(c + 1); }
  else snprintf(path, sizeof path, "%s", fp);
  FILE *f = fopen(path, "rb"); fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET); unsigned char *b = malloc(n); fread(b, 1, n, f); fclose(f);
  CFDataRef d = CFDataCreate(NULL, b, n);
  CTFontDescriptorRef desc = CTFontManagerCreateFontDescriptorFromData(d);
  if (wght) {
    CFMutableDictionaryRef var = CFDictionaryCreateMutable(NULL, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    int tw = 'wght', to = 'opsz'; double ov = size;
    CFDictionarySetValue(var, CFNumberCreate(NULL, kCFNumberIntType, &tw), CFNumberCreate(NULL, kCFNumberDoubleType, &wght));
    CFDictionarySetValue(var, CFNumberCreate(NULL, kCFNumberIntType, &to), CFNumberCreate(NULL, kCFNumberDoubleType, &ov));
    CFMutableDictionaryRef at = CFDictionaryCreateMutable(NULL, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFDictionarySetValue(at, kCTFontVariationAttribute, var);
    desc = CTFontDescriptorCreateCopyWithAttributes(desc, at);
  }
  font = CTFontCreateWithFontDescriptor(desc, size, NULL);
  uint8_t *px = calloc(w * h * 4, 1);
  CGColorSpaceRef cs = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef ctx = CGBitmapContextCreate(px, w, h, 8, w * 4, cs, kCGImageAlphaPremultipliedLast);
  if (!strchr(flags, 'F')) { CGContextTranslateCTM(ctx, 0, h); CGContextScaleCTM(ctx, s, -s); }
  CGContextSetAllowsFontSubpixelPositioning(ctx, strchr(flags, 'P') != 0);
  CGContextSetShouldSubpixelPositionFonts(ctx, strchr(flags, 'P') != 0);
  CGContextSetAllowsFontSubpixelQuantization(ctx, strchr(flags, 'Q') != 0);
  CGContextSetShouldSubpixelQuantizeFonts(ctx, strchr(flags, 'Q') != 0);
  CGContextSetShouldAntialias(ctx, strchr(flags, 'A') != 0);
  CGContextSetShouldSmoothFonts(ctx, strchr(flags, 'S') != 0);
  CGContextSetAllowsFontSmoothing(ctx, strchr(flags, 'S') != 0);
  CGContextSetRGBFillColor(ctx, 1, 1, 1, 1);
  if (!strchr(flags, 'N')) CGContextSetTextMatrix(ctx, CGAffineTransformMakeScale(1, -1));
  for (int i = 7; i < argc; i++) {
    unsigned g; double x, y; sscanf(argv[i], "%u:%lf,%lf", &g, &x, &y);
    CGGlyph gg = g; CGPoint p = CGPointMake(x, strchr(flags, 'N') ? y : -y);

    CTFontDrawGlyphs(font, &gg, &p, 1, ctx);
  }
  for (int i = 0; i < w * h; i++) printf("%02x", px[i * 4 + 3]);
  printf("\n");
}
