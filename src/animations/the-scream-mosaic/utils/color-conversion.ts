import type { LAB, RGB } from '../types';

// Convert RGB to XYZ color space
const rgbToXyz = (rgb: RGB): { x: number; y: number; z: number } => {
  // Normalize RGB values to 0-1 range
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;

  // Apply gamma correction (sRGB)
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Scale to 0-100
  r *= 100;
  g *= 100;
  b *= 100;

  // Observer: 2°, Illuminant: D65
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  return { x, y, z };
};

// Reference white point D65
const REF_X = 95.047;
const REF_Y = 100.0;
const REF_Z = 108.883;

// Convert XYZ to LAB
const xyzToLab = (xyz: { x: number; y: number; z: number }): LAB => {
  let x = xyz.x / REF_X;
  let y = xyz.y / REF_Y;
  let z = xyz.z / REF_Z;

  const epsilon = 0.008856; // (6/29)^3
  const kappa = 903.3; // (29/3)^3

  x = x > epsilon ? Math.pow(x, 1 / 3) : (kappa * x + 16) / 116;
  y = y > epsilon ? Math.pow(y, 1 / 3) : (kappa * y + 16) / 116;
  z = z > epsilon ? Math.pow(z, 1 / 3) : (kappa * z + 16) / 116;

  const l = 116 * y - 16;
  const a = 500 * (x - y);
  const b = 200 * (y - z);

  return { l, a, b };
};

// Convert RGB to LAB
export const rgbToLab = (rgb: RGB): LAB => {
  const xyz = rgbToXyz(rgb);
  return xyzToLab(xyz);
};

// Convert LAB back to RGB (useful for debugging)
export const labToRgb = (lab: LAB): RGB => {
  // LAB to XYZ
  const y = (lab.l + 16) / 116;
  const x = lab.a / 500 + y;
  const z = y - lab.b / 200;

  const epsilon = 0.008856;
  const kappa = 903.3;

  const x3 = Math.pow(x, 3);
  const z3 = Math.pow(z, 3);

  const xr = x3 > epsilon ? x3 : (116 * x - 16) / kappa;
  const yr =
    lab.l > kappa * epsilon ? Math.pow((lab.l + 16) / 116, 3) : lab.l / kappa;
  const zr = z3 > epsilon ? z3 : (116 * z - 16) / kappa;

  const xFinal = xr * REF_X;
  const yFinal = yr * REF_Y;
  const zFinal = zr * REF_Z;

  // XYZ to RGB
  let r = (xFinal * 3.2404542 - yFinal * 1.5371385 - zFinal * 0.4985314) / 100;
  let g = (-xFinal * 0.969266 + yFinal * 1.8760108 + zFinal * 0.041556) / 100;
  let b = (xFinal * 0.0556434 - yFinal * 0.2040259 + zFinal * 1.0572252) / 100;

  // Apply inverse gamma correction
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
  b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b;

  return {
    r: Math.round(Math.max(0, Math.min(255, r * 255))),
    g: Math.round(Math.max(0, Math.min(255, g * 255))),
    b: Math.round(Math.max(0, Math.min(255, b * 255))),
  };
};
