import { useWindowDimensions } from 'react-native';

import { TextToEye } from './text-to-eye';

export const TextToEyeScreen = () => {
  const { width, height } = useWindowDimensions();
  return <TextToEye width={width} height={height} />;
};
