import { observable } from '@legendapp/state';

// Index of the currently visible Springboard page.
//
// It's a legend-state observable rather than React state on purpose: each icon
// reads it through `useSelector(() => activePage$.get() === pageIndex)`, so when
// the page changes only the handful of icons whose enabled flag actually flips
// re-render — the Springboard and every other icon are untouched. (Plain state
// would re-render the whole grid on every page change.)
export const activePage$ = observable(0);

// Slug of the demo currently open (or closing) from the grid, null at rest.
//
// Drives per-cell stacking: during the close zoom the library elevates the
// source BOUNDARY with zIndex, but since the cell restructure (icon Trigger
// nested inside a View inside zeego's ContextMenu.Trigger) that zIndex lives
// two wrappers deep — and zIndex can't lift content above the SIBLINGS of its
// ancestors. The page's actual siblings are the ContextMenu wrappers, so the
// shrinking icon painted UNDER later cells. Each AppIcon subscribes with
// useSelector and applies zIndex to its OUTERMOST wrapper while it's the open
// one (same one-icon-re-renders pattern as activePage$ above).
export const elevatedSlug$ = observable<string | null>(null);
