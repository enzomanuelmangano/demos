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

// Move-quality colours (chess.com-style review). All OKLCH-derived, same
// convention as the palette above.
export const quality = {
  brilliant: '#39bab4', //  oklch(0.720 0.110 190)
  great: '#5188cd', //      oklch(0.620 0.120 255)
  book: '#968368', //       oklch(0.620 0.045 75)
  best: '#67d283', //       oklch(0.780 0.150 150)
  excellent: '#8bd28d', //  oklch(0.800 0.120 145)
  good: '#87be92', //       oklch(0.750 0.085 150)
  inaccuracy: '#e6c45a', // oklch(0.830 0.130 92)
  mistake: '#ee9b58', //    oklch(0.760 0.130 58)
  miss: '#e36650', //       oklch(0.660 0.160 32)
  blunder: '#ed4952', //    oklch(0.640 0.200 22)
};
