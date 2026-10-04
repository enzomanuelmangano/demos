// Pull-to-search tuning (iOS App Library-style in-place reveal).
//
// SEARCH_TRIGGER: downward pull (px) at which the reveal reaches full and, once
// released past it, commits to the search view. The grid's rubber-band keeps
// pulling past this, but the reveal (blur + surface) is clamped to full here.
export const SEARCH_TRIGGER = 100;

// How the search arrives, as fractions of the reveal (0 → 1): the home's blur
// builds gently over the whole pull (whole at `blurFull`, its second pass over
// `blurExtra`); the field and its Cancel come in over it, then the results.
export const SEARCH_REVEAL = {
  blurFull: 1,
  // The search's second blur pass, over the last stretch only.
  blurExtra: [0.5, 1],
  field: [0.2, 0.6],
  list: [0.55, 1],
} as const;
