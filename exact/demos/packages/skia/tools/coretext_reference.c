// Skia m157's iOS glyph masks, from Skia's own code (google/skia, chrome/m157), for the skia
// package's CoreText parity test (src/glyphs.rs, coretext_masks_are_skias). Transcribed with
// only the Skia types replaced by C ones:
// - src/ports/SkTypeface_mac_ct.cpp: ctfont_from_skdata, ctvariation_from_SkFontArguments,
//   MakeFromStream (the typeface: CTFontManagerCreateFontDescriptorFromData, every axis at the
//   requested value pinned to its range, else its default), onFilterRec (iOS: smoothing none,
//   so unhinted A8, pre-blend kept, contrast 0).
// - src/utils/mac/SkCTFontCreateExactCopy.cpp: the strike's font.
// - src/core/SkScalerContext.cpp: MakeRecAndEffects (sk_relax), computeMatrices(kVertical),
//   SkComputeGivensRotation (src/utils/SkMatrix22.cpp).
// - src/core/SkMaskGamma.cpp: SkTMaskGamma_build_correcting_lut, sRGB luminance, <3,3,3>.
// - src/ports/SkScalerContext_mac_ct.cpp: generateMetrics, Offscreen::getCG, generateImage,
//   RGBToA8<true>.
//
// cc -O0 -ffp-contract=off coretext_reference.c -framework CoreText -framework CoreGraphics \
//    -framework CoreFoundation -o coretext_reference
// coretext_reference <font> <size> <sx> <kx> <ky> <sy> <paint RRGGBB> <probe=<spider.ttf>|none|some> <axes tag=value,...|-> <glyph>...
// prints "behavior <n> lum <index>", then per glyph "glyph left top width height" and the mask's
// bytes in hex, or "glyph empty". `probe=` is SkCTFontGetSmoothBehavior (src/utils/mac/SkCTFont.cpp,
// its spider font, src/spider_symbol.ttf); none / some force it.

#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <CoreText/CoreText.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef uint32_t CGRGBPixel;


// ---- SkMaskGamma.cpp ----
static float toLuma(float luminance) {
    if (luminance <= 0.04045f) {
        return luminance / 12.92f;
    }
    return powf((luminance + 0.055f) / 1.055f, 2.4f);
}
static float fromLuma(float luma) {
    if (luma <= 0.0031308f) {
        return luma * 12.92f;
    }
    return 1.055f * powf(luma, 1.0f / 2.4f) - 0.055f;
}
static float apply_contrast(float srca, float contrast) {
    return srca + ((1.0f - srca) * contrast * srca);
}
static int sk_float_round2int(float x) { return (int)floor((double)x + 0.5); }
static void build_correcting_lut(uint8_t* table, unsigned srcI, float contrast) {
    const float src = (float)srcI / 255.0f;
    const float linSrc = toLuma(src);
    const float dst = 1.0f - src;
    const float linDst = toLuma(dst);
    const float adjustedContrast = contrast * linDst;
    if (fabs(src - dst) < (1.0f / 256.0f)) {
        float ii = 0.0f;
        for (int i = 0; i < 256; ++i, ii += 1.0f) {
            float rawSrca = ii / 255.0f;
            float srca = apply_contrast(rawSrca, adjustedContrast);
            table[i] = (uint8_t)sk_float_round2int(255.0f * srca);
        }
    } else {
        float ii = 0.0f;
        for (int i = 0; i < 256; ++i, ii += 1.0f) {
            float rawSrca = ii / 255.0f;
            float srca = apply_contrast(rawSrca, adjustedContrast);
            float dsta = 1.0f - srca;
            float linOut = (linSrc * srca + dsta * linDst);
            float out = fromLuma(linOut);
            float result = (out - dst) / (src - dst);
            table[i] = (uint8_t)sk_float_round2int(255.0f * result);
        }
    }
}
static unsigned sk_t_scale255_3(unsigned base) {
    base <<= (8 - 3);
    unsigned lum = base;
    for (unsigned int i = 3; i < 8; i += 3) {
        lum |= base >> i;
    }
    return lum;
}

// ---- SkScalerContext.cpp ----
static float sk_relax(float x) {
    float n = (float)floor((double)(x * 1024) + 0.5);
    return n / 1024.0f;
}
// SkMatrix as [scaleX, skewX, skewY, scaleY].
static int computeMatrices(const float A[4], float* sOut, float sA[4]) {
    float GA[4];
    int skewedOrFlipped = A[1] != 0 || A[2] != 0 || A[0] < 0 || A[3] < 0;
    if (skewedOrFlipped) {
        float a = A[0], b = A[2], c, s;
        if (0 == b) {
            c = copysignf(1.0f, a);
            s = 0;
        } else if (0 == a) {
            c = 0;
            s = -copysignf(1.0f, b);
        } else if (fabsf(b) > fabsf(a)) {
            float t = a / b;
            float u = copysignf(sqrtf(1.0f + t * t), b);
            s = -1.0f / u;
            c = -s * t;
        } else {
            float t = b / a;
            float u = copysignf(sqrtf(1.0f + t * t), a);
            c = 1.0f / u;
            s = -c * t;
        }
        // G.setSinCos(s, c) = [c -s; s c]; GA = G * A.
        GA[0] = c * A[0] + -s * A[2];
        GA[1] = c * A[1] + -s * A[3];
        GA[2] = s * A[0] + c * A[2];
        GA[3] = s * A[1] + c * A[3];
    } else {
        memcpy(GA, A, sizeof GA);
    }
    const float nearlyZero = 1.0f / (1 << 12);
    if (fabsf(GA[0]) <= nearlyZero || fabsf(GA[3]) <= nearlyZero) {
        return 0;
    }
    float yScale = fabsf(GA[3]);
    *sOut = yScale;
    if (!skewedOrFlipped && A[0] == A[3]) {
        sA[0] = 1; sA[1] = 0; sA[2] = 0; sA[3] = 1;
    } else if (!skewedOrFlipped) {
        sA[0] = A[0] / yScale; sA[1] = 0; sA[2] = 0; sA[3] = 1;
    } else {
        float inv = 1.0f / yScale;
        sA[0] = A[0] * inv; sA[1] = A[1] * inv; sA[2] = A[2] * inv; sA[3] = A[3] * inv;
    }
    return 1;
}

// ---- SkTypeface_mac_ct.cpp: MakeFromStream ----
static CTFontRef make_typeface(const char* path, const char* axesArg, int* opszSet, double* opszValue) {
    FILE* f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    uint8_t* bytes = malloc(size);
    fread(bytes, 1, size, f);
    fclose(f);
    CFDataRef data = CFDataCreate(kCFAllocatorDefault, bytes, size);
    CTFontDescriptorRef desc = CTFontManagerCreateFontDescriptorFromData(data);
    CTFontRef ct = CTFontCreateWithFontDescriptor(desc, 0, NULL);
    *opszSet = 0;
    if (strcmp(axesArg, "-") == 0) {
        return ct;
    }
    CFArrayRef ctAxes = CTFontCopyVariationAxes(ct);
    CFDictionaryRef old = CTFontCopyVariation(ct);
    CFIndex axisCount = ctAxes ? CFArrayGetCount(ctAxes) : 0;
    CFMutableDictionaryRef variation = CFDictionaryCreateMutable(kCFAllocatorDefault, axisCount, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    for (CFIndex i = 0; i < axisCount; ++i) {
        CFDictionaryRef axis = CFArrayGetValueAtIndex(ctAxes, i);
        CFNumberRef tagNumber = CFDictionaryGetValue(axis, kCTFontVariationAxisIdentifierKey);
        int64_t tagLong;
        CFNumberGetValue(tagNumber, kCFNumberSInt64Type, &tagLong);
        double minD, maxD, defD;
        CFNumberGetValue(CFDictionaryGetValue(axis, kCTFontVariationAxisMinimumValueKey), kCFNumberDoubleType, &minD);
        CFNumberGetValue(CFDictionaryGetValue(axis, kCTFontVariationAxisMaximumValueKey), kCFNumberDoubleType, &maxD);
        CFNumberGetValue(CFDictionaryGetValue(axis, kCTFontVariationAxisDefaultValueKey), kCFNumberDoubleType, &defD);
        double value = defD;
        if (old) {
            CFNumberRef current = CFDictionaryGetValue(old, tagNumber);
            if (current) CFNumberGetValue(current, kCFNumberDoubleType, &value);
        }
        // The requested axes: "wght=400,opsz=12".
        const char* p = axesArg;
        while (*p) {
            char tag[5] = {0};
            double v;
            if (sscanf(p, "%4[^=]=%lf", tag, &v) == 2) {
                int64_t t = ((int64_t)tag[0] << 24) | ((int64_t)tag[1] << 16) | ((int64_t)tag[2] << 8) | (int64_t)tag[3];
                if (t == tagLong) {
                    value = v < minD ? minD : (v > maxD ? maxD : v);
                    if (t == 0x6F70737A) *opszSet = 1;
                }
            }
            const char* comma = strchr(p, ',');
            if (!comma) break;
            p = comma + 1;
        }
        if (tagLong == 0x6F70737A) *opszValue = value;
        CFNumberRef valueNumber = CFNumberCreate(kCFAllocatorDefault, kCFNumberDoubleType, &value);
        CFDictionaryAddValue(variation, tagNumber, valueNumber);
    }
    CFMutableDictionaryRef attributes = CFDictionaryCreateMutable(kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFDictionaryAddValue(attributes, kCTFontVariationAttribute, variation);
    CTFontDescriptorRef varDesc = CTFontDescriptorCreateWithAttributes(attributes);
    return CTFontCreateCopyWithAttributes(ct, 0, NULL, varDesc);
}

// ---- SkCTFontCreateExactCopy.cpp ----
static CTFontRef exact_copy(CTFontRef baseFont, CGFloat textSize, int opszSet, double opszValue) {
    CFMutableDictionaryRef attr = CFDictionaryCreateMutable(kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFStringRef SkCTFontOpticalSizeAttribute = CFSTR("NSCTFontOpticalSizeAttribute");
    double opsz_val = opszValue;
    if (!opszSet) {
        CFTypeRef opsz = CTFontCopyAttribute(baseFont, SkCTFontOpticalSizeAttribute);
        if (!opsz || CFGetTypeID(opsz) != CFNumberGetTypeID() || !CFNumberGetValue((CFNumberRef)opsz, kCFNumberDoubleType, &opsz_val) || opsz_val <= 0) {
            opsz_val = CTFontGetSize(baseFont);
        }
    }
    CFNumberRef opszNumber = CFNumberCreate(kCFAllocatorDefault, kCFNumberDoubleType, &opsz_val);
    CFDictionarySetValue(attr, SkCTFontOpticalSizeAttribute, opszNumber);
    int zero = 0;
    CFNumberRef zeroNumber = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &zero);
    CFDictionarySetValue(attr, CFSTR("NSCTFontUnscaledTrackingAttribute"), zeroNumber);
    CTFontDescriptorRef desc = CTFontDescriptorCreateWithAttributes(attr);
    return CTFontCreateCopyWithAttributes(baseFont, textSize, NULL, desc);
}

// ---- SkCTFont.cpp: SkCTFontGetSmoothBehavior ----
enum { kNone = 0, kSome = 1, kSubpixel = 2 };
static int smooth_behavior(const char* spiderPath) {
    uint32_t noSmoothBitmap[16][16] = {};
    uint32_t smoothBitmap[16][16] = {};
    const CGBitmapInfo kBitmapInfoRGB = ((CGBitmapInfo)kCGImageAlphaNoneSkipFirst | kCGBitmapByteOrder32Host);
    CGColorSpaceRef colorspace = CGColorSpaceCreateDeviceRGB();
    CGContextRef noSmoothContext = CGBitmapContextCreate(&noSmoothBitmap, 16, 16, 8, 16*4, colorspace, kBitmapInfoRGB);
    CGContextRef smoothContext = CGBitmapContextCreate(&smoothBitmap, 16, 16, 8, 16*4, colorspace, kBitmapInfoRGB);
    FILE* f = fopen(spiderPath, "rb");
    if (!f) return -1;
    uint8_t bytes[4096];
    size_t n = fread(bytes, 1, sizeof bytes, f);
    fclose(f);
    CFDataRef data = CFDataCreateWithBytesNoCopy(kCFAllocatorDefault, bytes, n, kCFAllocatorNull);
    CTFontDescriptorRef desc = CTFontManagerCreateFontDescriptorFromData(data);
    CTFontRef ctFont = CTFontCreateWithFontDescriptor(desc, 16, NULL);
    CGContextSetShouldSmoothFonts(noSmoothContext, false);
    CGContextSetShouldAntialias(noSmoothContext, true);
    CGContextSetTextDrawingMode(noSmoothContext, kCGTextFill);
    CGContextSetGrayFillColor(noSmoothContext, 1, 1);
    CGContextSetShouldSmoothFonts(smoothContext, true);
    CGContextSetShouldAntialias(smoothContext, true);
    CGContextSetTextDrawingMode(smoothContext, kCGTextFill);
    CGContextSetGrayFillColor(smoothContext, 1, 1);
    CGPoint point = CGPointMake(0, 3);
    CGGlyph spiderGlyph = 3;
    CTFontDrawGlyphs(ctFont, &spiderGlyph, &point, 1, noSmoothContext);
    CTFontDrawGlyphs(ctFont, &spiderGlyph, &point, 1, smoothContext);
    int smoothBehavior = kNone;
    for (int x = 0; x < 16; ++x) {
        for (int y = 0; y < 16; ++y) {
            uint32_t smoothPixel = smoothBitmap[x][y];
            uint32_t r = (smoothPixel >> 16) & 0xFF;
            uint32_t g = (smoothPixel >>  8) & 0xFF;
            uint32_t b = (smoothPixel >>  0) & 0xFF;
            if (r != g || r != b) {
                return kSubpixel;
            }
            if (noSmoothBitmap[x][y] != smoothPixel) {
                smoothBehavior = kSome;
            }
        }
    }
    return smoothBehavior;
}

// SkMaskGamma::CanonicalColor, one channel.
static unsigned canonical(unsigned c) { return sk_t_scale255_3(c >> 5); }
static unsigned SkComputeLuminance(unsigned r, unsigned g, unsigned b) { return (r * 54 + g * 183 + b * 19) >> 8; }

// ---- SkScalerContext_mac_ct.cpp ----
static CGContextRef fCG;
static CGRGBPixel* fImageStorage;
static int fW, fH;
static int RoundSize(int dimension) {
    int n = 1;
    while (n < dimension) n <<= 1;
    return n;
}

int main(int argc, char** argv) {
    if (argc < 11) return 2;
    float size = atof(argv[2]);
    float post[4] = {sk_relax(atof(argv[3])), sk_relax(atof(argv[4])), sk_relax(atof(argv[5])), sk_relax(atof(argv[6]))};
    unsigned paint = (unsigned)strtoul(argv[7], NULL, 16);
    int behavior;
    if (strncmp(argv[8], "probe=", 6) == 0) {
        behavior = smooth_behavior(argv[8] + 6);
    } else {
        behavior = strcmp(argv[8], "none") == 0 ? kNone : kSome;
    }
    // MakeRecAndEffects: setHinting(kNormal), setLuminanceColor(paint) (canonical), contrast
    // SK_GAMMA_CONTRAST (0.5, stored as 128), device gamma SK_GAMMA_EXPONENT (0).
    unsigned lr = canonical((paint >> 16) & 0xFF), lg = canonical((paint >> 8) & 0xFF), lb = canonical(paint & 0xFF);
    int hinted = 1;
    uint8_t contrast = (uint8_t)((0.5f * 255) + 0.5f);
    // onFilterRec (A8, SK_GAMMA_APPLY_TO_A8 defined).
    if (behavior == kNone) hinted = 0;
    if (!hinted) {
        // #ifndef SK_GAMMA_APPLY_TO_A8 ignorePreBlend #endif: nothing.
    } else {
        if (behavior == kSome) { lr = lr * 1/2; lg = lg * 1/2; lb = lb * 1/2; }
        else if (behavior == kSubpixel) { lr = lr * 3/4; lg = lg * 3/4; lb = lb * 3/4; }
        lr = canonical(lr); lg = canonical(lg); lb = canonical(lb);
        contrast = (uint8_t)((0.0f * 255) + 0.5f);
    }
    // PreprocessRec: A8 luminance, canonical; GetMaskPreBlend: the table of G >> 5.
    unsigned lum = canonical(SkComputeLuminance(lr, lg, lb));
    unsigned lumIndex = lum >> 5;
    int requestSmooth = hinted;
    printf("behavior %d lum %u\n", behavior, lumIndex);
    int opszSet;
    double opszValue = 0;
    CTFontRef typeface = make_typeface(argv[1], argv[9], &opszSet, &opszValue);
    if (!typeface) return 3;

    // getSingleMatrix: Scale(size, size) postConcat post2x2.
    float A[4] = {post[0] * size, post[1] * size, post[2] * size, post[3] * size};
    float s, sA[4];
    if (!computeMatrices(A, &s, sA)) return 4;
    CGAffineTransform fTransform = CGAffineTransformMake(sA[0], -sA[2], -sA[1], sA[3], 0, 0);
    CGAffineTransform fInvTransform = CGAffineTransformInvert(fTransform);
    CTFontRef fCTFont = exact_copy(typeface, s, opszSet, opszValue);

    uint8_t table[256];
    build_correcting_lut(table, sk_t_scale255_3(lumIndex), (float)contrast / 255);

    CGColorSpaceRef rgb = CGColorSpaceCreateDeviceRGB();
    for (int a = 10; a < argc; ++a) {
        CGGlyph cgGlyph = (CGGlyph)atoi(argv[a]);
        // generateMetrics.
        CGSize cgAdvance;
        CTFontGetAdvancesForGlyphs(fCTFont, kCTFontOrientationHorizontal, &cgGlyph, &cgAdvance, 1);
        cgAdvance = CGSizeApplyAffineTransform(cgAdvance, fTransform);
        CGRect cgBounds;
        CTFontGetBoundingRectsForGlyphs(fCTFont, kCTFontOrientationHorizontal, &cgGlyph, &cgBounds, 1);
        cgBounds = CGRectApplyAffineTransform(cgBounds, fTransform);
        if (0 == cgAdvance.width && 0 == cgAdvance.height) {
            CGPathRef path = CTFontCreatePathForGlyph(fCTFont, cgGlyph, NULL);
            if (!path || CGPathIsEmpty(path)) {
                printf("%d empty\n", cgGlyph);
                continue;
            }
        }
        if (cgBounds.size.width <= 0 || cgBounds.size.height <= 0) {
            printf("%d empty\n", cgGlyph);
            continue;
        }
        float fl = (float)cgBounds.origin.x, ft = (float)(-cgBounds.origin.y - cgBounds.size.height);
        float fr = fl + (float)cgBounds.size.width, fb = ft + (float)cgBounds.size.height;
        int left = (int)floorf(fl) - 1, top = (int)floorf(ft) - 1;
        int right = (int)ceilf(fr) + 1, bottom = (int)ceilf(fb) + 1;
        int width = right - left, height = bottom - top;

        // getCG.
        size_t rowBytes = fW * sizeof(CGRGBPixel);
        if (!fCG || fW < width || fH < height) {
            if (fW < width) fW = RoundSize(width);
            if (fH < height) fH = RoundSize(height);
            rowBytes = fW * sizeof(CGRGBPixel);
            free(fImageStorage);
            fImageStorage = malloc(rowBytes * fH);
            const CGBitmapInfo bitmapInfo = kCGBitmapByteOrder32Host | (CGBitmapInfo)kCGImageAlphaNoneSkipFirst;
            if (fCG) CGContextRelease(fCG);
            fCG = CGBitmapContextCreate(fImageStorage, fW, fH, 8, rowBytes, rgb, bitmapInfo);
            CGContextSetAllowsFontSubpixelQuantization(fCG, false);
            CGContextSetShouldSubpixelQuantizeFonts(fCG, false);
            CGContextSetAllowsFontSubpixelPositioning(fCG, true);
            CGContextSetShouldSubpixelPositionFonts(fCG, true);
            CGContextSetTextDrawingMode(fCG, kCGTextFill);
            CGContextSetGrayFillColor(fCG, 0.0f, 1.0f);
            CGContextSetTextMatrix(fCG, fTransform);
            // fDoAA / fDoLCD forced to be set below.
        }
        // A8: doAA = true; doLCD = generateA8FromLCD (requestSmooth).
        CGContextSetShouldAntialias(fCG, true);
        CGContextSetShouldSmoothFonts(fCG, requestSmooth);
        CGRGBPixel* image = fImageStorage + (fH - height) * fW;
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) image[y * fW + x] = 0xFFFFFFFF;
        }
        CGPoint point = CGPointMake(-left, top + height);
        point = CGPointApplyAffineTransform(point, fInvTransform);
        CTFontDrawGlyphs(fCTFont, &cgGlyph, &point, 1, fCG);

        // generateImage: A8 && requestSmooth && behavior != none: gLinearCoverageFromCGLCDValue.
        if (requestSmooth && behavior != kNone) {
            for (int y = 0; y < height; ++y) {
                for (int x = 0; x < width; ++x) {
                    CGRGBPixel p = image[y * fW + x];
                    unsigned r = (p >> 16) & 0xFF, g = (p >> 8) & 0xFF, b = p & 0xFF;
                    image[y * fW + x] = (((r * r + 128) / 255) << 16) | (((g * g + 128) / 255) << 8) | ((b * b + 128) / 255);
                }
            }
        }
        // RGBToA8<true>.
        printf("%d %d %d %d %d\n", cgGlyph, left, top, width, height);
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                CGRGBPixel rgbp = image[y * fW + x];
                unsigned r = 0xFF - ((rgbp >> 16) & 0xFF);
                unsigned g = 0xFF - ((rgbp >> 8) & 0xFF);
                unsigned b = 0xFF - ((rgbp >> 0) & 0xFF);
                unsigned lum = table[(r * 54 + g * 183 + b * 19) >> 8];
                printf("%02x", lum);
            }
        }
        printf("\n");
    }
    return 0;
}
