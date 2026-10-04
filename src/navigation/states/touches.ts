import { useEffect } from 'react';

import { useAtomValue } from 'jotai';

import { atomWithKVStorage } from './storage';
import {
  isTouchIndicatorAvailable,
  setTouchIndicatorEnabled,
} from '../../../modules/touch-indicator/src';

/**
 * Whether a disc is drawn under each finger, for screen recordings. Stored,
 * because a relaunch restarts the native side with the overlay off.
 */
export const ShowTouchesAtom = atomWithKVStorage('show_touches', false);

/** The setting is offered only where the native overlay is in the binary. */
export const canShowTouches = isTouchIndicatorAvailable;

/**
 * Keeps the native overlay in step with the setting: on launch, which re-arms
 * a remembered choice, and on every toggle. Mounted once, at the root.
 */
export const useTouchIndicatorSync = () => {
  const showTouches = useAtomValue(ShowTouchesAtom);
  useEffect(() => {
    setTouchIndicatorEnabled(showTouches);
  }, [showTouches]);
};
