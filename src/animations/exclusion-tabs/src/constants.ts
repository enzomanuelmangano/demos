import { Platform } from 'react-native';

import { matchFont } from '@shopify/react-native-skia';

// I was lazy and decided to use the default font provided by Skia 😅
const fontFamily = Platform.select({ ios: 'Helvetica', default: 'serif' });
const fontStyle = {
  fontFamily,
  fontSize: 13,
  fontStyle: 'normal',
  fontWeight: 'bold',
} as const;

export const font = matchFont(fontStyle);
