// Thank you ChatGPT !!!

export function hsvToRgb(
  h: number,
  s: number,
  v: number,
): [number, number, number] {
  'worklet';
  // Ensure h is in the range [0, 360)
  h = h % 360;
  if (h < 0) {
    h += 360;
  }

  // Convert h, s, and v to the range [0, 1]
  h /= 360;
  s /= 100;
  v /= 100;

  let r, g, b;
  if (s === 0) {
    // If s is 0, the color is a shade of gray
    r = g = b = v;
  } else {
    // Calculate the hue sector and the fractional part within the sector
    const sector = h * 6;
    const sectorIndex = Math.floor(sector);
    const fractional = sector - sectorIndex;

    // Calculate values for the three primary colors
    const p = v * (1 - s);
    const q = v * (1 - s * fractional);
    const t = v * (1 - s * (1 - fractional));

    switch (sectorIndex) {
      case 0:
        r = v;
        g = t;
        b = p;
        break;
      case 1:
        r = q;
        g = v;
        b = p;
        break;
      case 2:
        r = p;
        g = v;
        b = t;
        break;
      case 3:
        r = p;
        g = q;
        b = v;
        break;
      case 4:
        r = t;
        g = p;
        b = v;
        break;
      default:
        r = v;
        g = p;
        b = q;
        break;
    }
  }

  // Scale the result to the range [0, 255] and return as tuple
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
