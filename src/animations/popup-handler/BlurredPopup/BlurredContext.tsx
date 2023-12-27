import React from 'react';
import type { MeasuredDimensions } from 'react-native-reanimated';

/**
 * Specifies the alignment options for the popup menu.
 */
type PopupAlignment = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Defines the shape of a popup option.
 */
type PopupOptionType = {
  label: string;
  onPress?: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

/**
 * Defines the shape of the context object for the blurred popup menu.
 */
type BlurredContextType = {
  /**
   * Shows the popup menu with the specified parameters.
   * @param layout - The measured dimensions of the component triggering the popup.
   * @param node - The component triggering the popup.
   * @param options - The options for the popup menu.
   */
  showPopup: (params: {
    layout: MeasuredDimensions;
    node: React.ReactNode;
    options: PopupOptionType[];
  }) => void;
};

/**
 * The context object used to provide the blurred popup menu functionality.
 */
const BlurredPopupContext = React.createContext<BlurredContextType>({
  showPopup: () => {
    // Default showPopup function does nothing
  },
});

export {
  PopupAlignment,
  PopupOptionType,
  BlurredContextType,
  BlurredPopupContext,
};
