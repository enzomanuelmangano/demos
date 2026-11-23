import TouchIndicatorModule from './TouchIndicatorModule';

/**
 * Draws a disc under each finger, so a screen recording shows what the hand
 * did and not only what the app did.
 *
 * Development affordance. It is off until something turns it on, and the
 * native side does not patch UIKit's event delivery until then.
 */

/** True when the native module is linked — iOS, and a build made after it was
 *  added. Everything below is a no-op when it is not. */
export const isTouchIndicatorAvailable = (): boolean =>
  TouchIndicatorModule != null;

export const setTouchIndicatorEnabled = (enabled: boolean): void => {
  TouchIndicatorModule?.setEnabled(enabled);
};

export const isTouchIndicatorEnabled = (): boolean =>
  TouchIndicatorModule?.isEnabled() ?? false;
