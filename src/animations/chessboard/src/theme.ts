// Colour system.
//
// Neutrals are one OKLCH ramp — fixed hue 265 (leans cool, toward the blue
// accent), low controlled chroma, evenly stepped lightness — so every grey is
// perceptually consistent instead of drifting in hue. Accent / board / status
// colours sit in the same hue family. React Native can't parse `oklch()`, so
// these are the exact sRGB hex for the listed OKLCH values (see scripts).
export const theme = {
  bg: '#0d0e12', //        oklch(0.165 0.007 265)
  surface: '#17191f', //   oklch(0.215 0.012 265)  card
  surfaceHi: '#202329', // oklch(0.255 0.012 265)  raised card / clock
  border: '#2c2f35', //    oklch(0.305 0.012 265)
  textFaint: '#60636a', // oklch(0.500 0.012 265)
  textMuted: '#8f9298', // oklch(0.660 0.010 265)
  text: '#f0f2f5', //      oklch(0.960 0.005 265)

  accent: '#3a91f8', //    oklch(0.655 0.175 255)
  win: '#5fe19e', //       oklch(0.820 0.150 158)
  lose: '#f56b76', //      oklch(0.700 0.170 18)

  boardLight: '#e5e8ed', // oklch(0.930 0.008 265)
  boardDark: '#818895', //  oklch(0.625 0.022 265)
};

// Move-quality colours (chess.com-style review). Pastel — soft and low-chroma —
// and hue-aligned with the main palette: `great` shares the accent hue (255),
// the positive greens share the win hue (158), the warnings sweep toward the
// lose hue (18), so the review reads as the same colour family as the app.
export const quality = {
  brilliant: '#84d5d1', //  oklch(0.820 0.080 192)
  great: '#90baf1', //      oklch(0.780 0.090 255)  // accent hue
  book: '#cebb9e', //       oklch(0.800 0.045 78)
  best: '#93d8b0', //       oklch(0.825 0.090 158)  // win hue
  excellent: '#a6dbb6', //  oklch(0.845 0.075 154)
  good: '#a6d2b6', //       oklch(0.825 0.060 157)
  inaccuracy: '#e9cf87', // oklch(0.860 0.095 90)
  mistake: '#ebaf86', //    oklch(0.800 0.090 55)
  miss: '#e79287', //       oklch(0.745 0.105 28)
  blunder: '#e18083', //    oklch(0.705 0.120 18)  // lose hue
};

// Profile photos — one per side (stable pravatar portraits).
export const avatarUri = {
  w: 'https://i.pravatar.cc/120?img=68',
  b: 'https://i.pravatar.cc/120?img=15',
} as const;
