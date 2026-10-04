// Pull-to-search tuning (iOS App Library-style in-place reveal).
//
// SEARCH_TRIGGER: downward pull (px) at which the reveal reaches full and, once
// released past it, commits to the search view. The grid's rubber-band keeps
// pulling past this, but the reveal (blur + surface) is clamped to full here.
export const SEARCH_TRIGGER = 100;

// The order the search arrives in, as fractions of the reveal (0 → 1): the
// home's blur first, whole by `blurFull`; then the field; then the results,
// only once the home has gone soft, so a row is never drawn over sharp icons.
export const SEARCH_REVEAL = {
  blurFull: 0.5,
  field: [0.15, 0.55],
  list: [0.5, 1],
} as const;
