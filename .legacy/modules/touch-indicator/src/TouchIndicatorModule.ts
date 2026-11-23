import { requireOptionalNativeModule } from 'expo';

export type TouchIndicatorNativeModule = {
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
};

// OPTIONAL on purpose. The module is iOS-only and lives in the app's native
// build, so a JS bundle can easily be newer than the binary running it — every
// Android build, and every iOS build made before this module was added. Asking
// for it optionally means those builds get `null` instead of a red screen.
export default requireOptionalNativeModule<TouchIndicatorNativeModule>(
  'TouchIndicator',
);
