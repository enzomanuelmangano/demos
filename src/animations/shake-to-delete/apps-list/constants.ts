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
  // Polished Silver
  { colors: ['#FFFFFF', '#C8CBD0', '#E6E8EA'] },
  // Platinum
  { colors: ['#F5F5F5', '#C0C0C0', '#DEDEDE'] },
  // Chrome
  { colors: ['#FFFFFF', '#C4C4C4', '#E8E8E8'] },
  // Gunmetal
  { colors: ['#595C63', '#2A2D33', '#424548'] },
  // Satin Silver
  { colors: ['#E5E5E5', '#B0B0B0', '#CCCCCC'] },
  // Metallic Gray
  { colors: ['#B4B7BC', '#7F8287', '#9A9DA2'] },
  // Pearl
  { colors: ['#FFFFFF', '#D6D6D6', '#F0F0F0'] },
  // Titanium Gray
  { colors: ['#DEE3ED', '#A5AAB3', '#C2C7D0'] },
  // Nickel
  { colors: ['#9B9B9E', '#636366', '#818184'] },
  // Mercury
  { colors: ['#F0F2F5', '#B8BBC0', '#D6D9DD'] },
  // Pewter
  { colors: ['#B3B5B1', '#7D7F7B', '#989A96'] },
  // Aluminum
  { colors: ['#D0D3D8', '#9CA0A5', '#B6B9BE'] },
  // Stainless
  { colors: ['#F2F2F2', '#BABABA', '#DADADA'] },
  // Matte Silver
  { colors: ['#D6D6D6', '#A0A0A0', '#BCBCBC'] },
  // Palladium
  { colors: ['#CDD0D4', '#959AA0', '#B3B6BA'] },
  // Rhodium
  { colors: ['#C4C4C4', '#8F8F8F', '#ABABAB'] },
  // Iridium
  { colors: ['#E8E9EC', '#B5B7BA', '#CED0D3'] },
  // Osmium
  { colors: ['#A6A9AD', '#6D7074', '#8C8F93'] },
  // Ruthenium
  { colors: ['#97999C', '#5F6164', '#7D7F82'] },
  // Brushed Nickel
  { colors: ['#C7CBD2', '#939AA4', '#ADB1C7'] },
  // Polished Steel
  { colors: ['#F5F6F8', '#B4B6B8', '#DCDDDF'] },
  // White Gold
  { colors: ['#FFFFFF', '#C3C3C6', '#E6E6E8'] },
  // Platinum Matte
  { colors: ['#E2E5E8', '#A1A4A7', '#C9CCD0'] },
] as const;

/**
 * Final app data array with unique IDs assigned to each item
 */
export const APPS_DATA = METALLIC_APPS_DATA_RAW.map(
  (item, index) => ({ ...item, id: index }) as const,
);

export type AppData = (typeof APPS_DATA)[number];
