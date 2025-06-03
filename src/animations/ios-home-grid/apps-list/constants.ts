/**
 * Collection of vibrant gradient color combinations for app backgrounds
 */
export const APPS_DATA_RAW = [
  { colors: ['#FF9A8B', '#FF6A88', '#FF99AC'] },
  { colors: ['#A8EDEA', '#FED6E3'] },
  { colors: ['#D4FC79', '#96E6A1'] },
  { colors: ['#84FAB0', '#8FD3F4'] },
  { colors: ['#FCCB90', '#D57EEB'] },
  { colors: ['#43E97B', '#38F9D7'] },
  { colors: ['#FA709A', '#FEE140'] },
  { colors: ['#4158D0', '#C850C0'] },
  { colors: ['#0093E9', '#80D0C7'] },
  { colors: ['#8EC5FC', '#E0C3FC'] },

  { colors: ['#08AEEA', '#2AF598'] },
  { colors: ['#FEE140', '#FA709A'] },
  { colors: ['#3EECAC', '#EE74E1'] },
  { colors: ['#4158D0', '#C850C0', '#FFCC70'] },
  { colors: ['#0BA360', '#3CBA92'] },
  { colors: ['#FBAB7E', '#F7CE68'] },
  { colors: ['#85FFBD', '#FFFB7D'] },
  { colors: ['#FF3CAC', '#784BA0', '#2B86C5'] },
  { colors: ['#FF9A9E', '#FAD0C4'] },
  { colors: ['#F6D365', '#FDA085'] },

  { colors: ['#21D4FD', '#B721FF'] },
  { colors: ['#08AEEA', '#2AF598'] },
  { colors: ['#FEE140', '#FA709A'] },
  { colors: ['#5EE7DF', '#B490CA'] },
  { colors: ['#D4FC79', '#96E6A1'] },
  { colors: ['#E2B0FF', '#9F44D3'] },
  { colors: ['#F761A1', '#8C1BAB'] },
  { colors: ['#43E97B', '#38F9D7'] },
  { colors: ['#FA709A', '#FEE140'] },
  { colors: ['#FFCC70', '#C850C0'] },

  { colors: ['#FBC2EB', '#A6C1EE'] },
  { colors: ['#FFD1FF', '#FAD0C4'] },
  { colors: ['#A8EDEA', '#FED6E3'] },
  { colors: ['#D4FC79', '#96E6A1'] },
  { colors: ['#84FAB0', '#8FD3F4'] },
  { colors: ['#FCCB90', '#D57EEB'] },
  { colors: ['#B5FFFC', '#FFDEE9'] },
  { colors: ['#E0C3FC', '#8EC5FC'] },
  { colors: ['#F5F7FA', '#C3CFE2'] },
  { colors: ['#FFDEE9', '#B5FFFC'] },

  { colors: ['#FF00E5', '#00FFE0'] },
  { colors: ['#00FF87', '#60EFFF'] },
  { colors: ['#FC466B', '#3F5EFB'] },
  { colors: ['#3B2667', '#BC78EC'] },
  { colors: ['#FF3CAC', '#562B7C'] },
  { colors: ['#FF0000', '#00C8FF'] },
  { colors: ['#F4D03F', '#16A085'] },
  { colors: ['#00FFA3', '#DC1FFF'] },
  { colors: ['#4158D0', '#C850C0'] },
  { colors: ['#0093E9', '#80D0C7'] },
] as const;

/**
 * Collection of metallic gradient color combinations for app backgrounds
 * Each color array represents [highlight, shadow, mid-tone] colors
 */
export const METALLIC_APPS_DATA_RAW = [
  // Brushed Steel
  { colors: ['#E8E9ED', '#B8B9BD', '#D1D2D6'] },
  // Dark Silver
  { colors: ['#C8CBD0', '#9A9DA2', '#B4B7BC'] },
  // Charcoal Platinum
  { colors: ['#DEDEDE', '#A8A8A8', '#C6C6C6'] },
  // Brushed Chrome
  { colors: ['#E8E8E8', '#B8B8B8', '#D0D0D0'] },
  // Gunmetal
  { colors: ['#595C63', '#2A2D33', '#424548'] },
  // Dark Satin
  { colors: ['#CCCCCC', '#969696', '#B1B1B1'] },
  // Metallic Gray
  { colors: ['#B4B7BC', '#7F8287', '#9A9DA2'] },
  // Smoky Pearl
  { colors: ['#e2e2e2', '#BABABA', '#D5D5D5'] },
  // Titanium Gray
  { colors: ['#DEE3ED', '#A5AAB3', '#C2C7D0'] },
  // Nickel
  { colors: ['#9B9B9E', '#636366', '#818184'] },
  // Mercury
  { colors: ['#808080', '#B8BBC0', '#D6D9DD'] },
  // Pewter
  { colors: ['#B3B5B1', '#7D7F7B', '#989A96'] },
  // Aluminum
  { colors: ['#D0D3D8', '#9CA0A5', '#B6B9BE'] },
  // Dark Stainless
  { colors: ['#DADADA', '#A4A4A4', '#BFBFBF'] },
  // Matte Silver
  { colors: ['#D6D6D6', '#A0A0A0', '#BCBCBC'] },
  // Palladium
  { colors: ['#CDD0D4', '#959AA0', '#B3B6BA'] },
  // Rhodium
  { colors: ['#C4C4C4', '#8F8F8F', '#ABABAB'] },
  // Iridium
  { colors: ['#cdcdcd', '#B5B7BA', '#CED0D3'] },
  // Osmium
  { colors: ['#A6A9AD', '#6D7074', '#8C8F93'] },
  // Ruthenium
  { colors: ['#97999C', '#5F6164', '#7D7F82'] },
  // Brushed Nickel
  { colors: ['#C7CBD2', '#939AA4', '#ADB1C7'] },
  // Polished Steel
  { colors: ['#d2d2d2', '#B4B6B8', '#DCDDDF'] },
  // Antique Gold
  { colors: ['#E6E6E8', '#B0B0B3', '#CBCBCE'] },
  // Platinum Matte
  { colors: ['#E2E5E8', '#A1A4A7', '#C9CCD0'] },
] as const;

/**
 * Collection of light theme-friendly gradient color combinations
 * These colors provide good contrast and readability on light backgrounds
 */
export const DARK_THEME_APPS_DATA_RAW = [
  // Soft Forest Gradients
  { colors: ['#6a9a4a', '#7bc47e', '#8ed48e'] },
  { colors: ['#5a7b5a', '#6cc86c', '#7ed47e'] },
  { colors: ['#3a5a3a', '#5a9a5a', '#6aba6a'] },

  // Elegant Emerald Flows
  { colors: ['#3a7b6a', '#5acab4', '#7edcd4'] },
  { colors: ['#3a8a7a', '#7ad4ca', '#9aeae0'] },
  { colors: ['#3a9a8a', '#9adbd4', '#bceee4'] },

  // Sophisticated Sage
  { colors: ['#7aaa5a', '#9acc7a', '#bcdd9a'] },
  { colors: ['#8aba6a', '#aadc8a', '#ccedaa'] },
  { colors: ['#9aca7a', '#caea9a', '#dcf4ba'] },

  // Refined Teal Transitions
  { colors: ['#3a8a9a', '#7aedf9', '#9cf4ff'] },
  { colors: ['#3a9aaa', '#5adcea', '#7ce4f4'] },
  { colors: ['#3aaabc', '#4aceda', '#5ce6ec'] },

  // Fresh Mint Flows
  { colors: ['#6aaa6a', '#8acb8a', '#aadcaa'] },
  { colors: ['#7aba7a', '#aad8aa', '#cce9cc'] },
  { colors: ['#7aca7a', '#bae6ba', '#ddf4dd'] },

  // Elegant Pine Gradients
  { colors: ['#5a8a5a', '#7aca7a', '#9adca9'] },
  { colors: ['#6a9a6a', '#8acb8a', '#aadcaa'] },
  { colors: ['#7aaa7a', '#9ad89a', '#bce6bc'] },

  // Serene Seafoam
  { colors: ['#3a9a8a', '#d2efeb', '#e4f6f4'] },
  { colors: ['#3aaa9a', '#aadbd4', '#cceae6'] },
  { colors: ['#3aba9a', '#7ac6bc', '#9cd8d2'] },

  // Luxurious Jade
  { colors: ['#3a7a6a', '#5ef9d6', '#7effea'] },
  { colors: ['#3a9a8a', '#8affea', '#acffef'] },
] as const;

/**
 * Final app data array with unique IDs assigned to each item
 */
export const APPS_DATA = METALLIC_APPS_DATA_RAW.map(
  (item, index) => ({ ...item, id: index }) as const,
);

export type AppData = (typeof APPS_DATA)[number];
