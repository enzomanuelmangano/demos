// Color configuration
export type ColorScheme = {
  level0: string; // No contributions
  level1: string; // Low contributions
  level2: string; // Medium contributions
  level3: string; // High contributions
  level4: string; // Very high contributions
};
// Default color schemes
export const COLOR_SCHEMES = {
  github: {
    level0: 'rgba(235, 237, 240, 1)', // Light grey
    level1: 'rgba(155, 233, 168, 1)', // Light green
    level2: 'rgba(64, 196, 99, 1)', // Medium green
    level3: 'rgba(48, 161, 78, 1)', // Dark green
    level4: 'rgba(33, 110, 57, 1)', // Darkest green
  },
  blue: {
    level0: 'rgba(235, 237, 240, 1)', // Light grey
    level1: 'rgba(174, 214, 241, 1)', // Light blue
    level2: 'rgba(93, 173, 226, 1)', // Medium blue
    level3: 'rgba(52, 144, 220, 1)', // Dark blue
    level4: 'rgba(21, 101, 192, 1)', // Darkest blue
  },
  purple: {
    level0: 'rgba(235, 237, 240, 1)', // Light grey
    level1: 'rgba(218, 191, 236, 1)', // Light purple
    level2: 'rgba(187, 143, 206, 1)', // Medium purple
    level3: 'rgba(156, 95, 176, 1)', // Dark purple
    level4: 'rgba(125, 47, 146, 1)', // Darkest purple
  },
} as const;

export const DEFAULT_COLOR_SCHEME: ColorScheme = COLOR_SCHEMES.github;
