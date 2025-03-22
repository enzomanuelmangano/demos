export const COLORS = {
  // Base colors
  background: '#0A1222', // Deep blue-based background
  surface: '#121D33', // Rich navy surface
  surfaceHighlight: '#1C2B4A', // Sophisticated blue highlight

  // Primary colors
  primary: '#3B82F6', // Vibrant blue
  primaryLight: '#60A5FA', // Lighter blue accent
  primaryTransparent: 'rgba(59, 130, 246, 0.15)',

  // Text colors
  text: '#FAFAFA', // Pure white for maximum readability
  textSecondary: '#E2E8F0', // Bright secondary
  textTertiary: '#94A3B8', // Subtle text

  // Accent colors
  accent: '#2563EB', // Rich blue for emphasis
  accentTransparent: 'rgba(37, 99, 235, 0.18)',

  // Functional colors
  border: 'rgba(148, 163, 184, 0.25)', // Subtle borders
  error: '#DC2626', // Clear red for errors
  success: '#059669', // Refined green for success

  // Game specific
  initial: '#94A3B8', // Muted initial numbers
  userInput: '#FFFFFF', // Crisp white for input
  highlight: 'rgba(59, 130, 246, 0.25)', // Subtle blue highlight
  highlightStrong: 'rgba(59, 130, 246, 0.35)', // Stronger blue highlight
  highlightTransparent: 'rgba(59, 130, 246, 0.0)',
} as const;

// Enhanced elevation with refined shadows
export const ELEVATION = {
  small: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  medium: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.23,
    shadowRadius: 6,
    elevation: 5,
  },
} as const;
