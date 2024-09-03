import { useFonts } from 'expo-font';

export const FontsProvider = ({ children }: { children: React.ReactNode }) => {
  const [fontsLoaded] = useFonts({
    'SF-Pro-Rounded-Bold': require('../../../assets/fonts/SF-Pro-Rounded-Bold.otf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return <>{children}</>;
};
