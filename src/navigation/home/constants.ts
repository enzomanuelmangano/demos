// Shared-bound group linking every launcher icon to its demo screen for the
// open-zoom. Used by both the AppIcon Trigger and the screen's zoom
// interpolator (app/_layout.tsx).
export const BOUNDS_GROUP = 'demos';

// Separate group for the search-overlay result rows. A demo opened from search
// zooms out of the tapped result row (Spotlight-style) instead of the grid
// icon, so its rows are their own shared-bound triggers. Distinct group so the
// row's `slug` tag never collides with the grid icon's same-`slug` tag (two
// boundaries sharing an entryTag strand transition styles -> blanked icons).
export const SEARCH_BOUNDS_GROUP = 'demos-search';
