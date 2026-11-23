/**
 * Collection of light metallic colors for app backgrounds
 */
export const APPS_DATA = [
  // Pearl White
  { color: '#E6E8EA' },
  // Light Silver
  { color: '#DDE1E4' },
  // Soft Platinum
  { color: '#CFD2D5' },
  // Bright Chrome
  { color: '#DCE0E3' },
  // Cool Gray
  { color: '#E4E6E9' },
  // Light Satin
  { color: '#D9DCDF' },
  // Bright Aluminum
  { color: '#CDD1D4' },
  // Snow Pearl
  { color: '#E1E3E6' },
  // Neutral Gray
  { color: '#DFE1E3' },
  // Light Nickel
  { color: '#D0D3D6' },
  // Bright Mercury
  { color: '#E8EAEC' },
  // Light Pewter
  { color: '#D8DADD' },
  // Polished Aluminum
  { color: '#DADDE0' },
  // Bright Steel
  { color: '#DFE2E5' },
  // Shimmering Silver
  { color: '#CBCED1' },
  // Light Palladium
  { color: '#D6D9DC' },
  // Bright Rhodium
  { color: '#D9DCDE' },
  // Moonlight
  { color: '#E6E8EB' },
  // Crystal Gray
  { color: '#DBDEE1' },
  // Light Titanium
  { color: '#D0D3D5' },
  // Frosted Nickel
  { color: '#DCDFE2' },
  // Mirror Steel
  { color: '#D7DADD' },
  // Soft Blue
  { color: '#E0E2E5' },
  // Bright Platinum
  { color: '#EAECED' },
  // Arctic Silver
  { color: '#DFE2E5' },
  // Cloud White
  { color: '#D2D5D8' },
  // Ice Pearl
  { color: '#DEE0E3' },
  // Lunar Gray
  { color: '#E4E6E9' },
] as const;

export type AppData = (typeof APPS_DATA)[number];
