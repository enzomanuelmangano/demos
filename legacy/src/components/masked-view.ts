import MaskedViewBase from '@react-native-masked-view/masked-view';

import type { ComponentType, ReactElement } from 'react';
import type { ViewProps } from 'react-native';

type MaskedViewProps = ViewProps & {
  maskElement: ReactElement;
  androidRenderingMode?: 'software' | 'hardware';
};

// The package's typings mix in `ReactNative.NativeMethods`, which RN 0.88 no
// longer exports, so its class no longer type-checks as a JSX element. Same
// component, with the props it declares.
export const MaskedView =
  MaskedViewBase as unknown as ComponentType<MaskedViewProps>;
