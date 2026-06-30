import { observable } from '@legendapp/state';

// Index of the currently visible Springboard page.
//
// It's a legend-state observable rather than React state on purpose: each icon
// reads it through `useSelector(() => activePage$.get() === pageIndex)`, so when
// the page changes only the handful of icons whose enabled flag actually flips
// re-render — the Springboard and every other icon are untouched. (Plain state
// would re-render the whole grid on every page change.)
export const activePage$ = observable(0);
