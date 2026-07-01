// Pull-to-search tuning (iOS App Library-style in-place reveal).
//
// SEARCH_TRIGGER: downward pull (px) at which the reveal reaches full and, once
// released past it, commits to the search view. The grid's rubber-band keeps
// pulling past this, but the reveal (blur + surface) is clamped to full here.
export const SEARCH_TRIGGER = 100;
