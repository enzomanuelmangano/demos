import { atomWithKVStorage } from './storage';

/**
 * Whether the close button is hidden on every demo, for clean recordings.
 * A demo can still be closed with the drag down — from anywhere it does not
 * keep for itself, and always from the status bar.
 */
export const HideCloseButtonAtom = atomWithKVStorage(
  'hide_close_button',
  false,
);
