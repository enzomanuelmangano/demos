import { useFonts } from 'expo-font';

export const FontsProvider = ({ children }: { children: React.ReactNode }) => {
  const [fontsLoaded] = useFonts({
    'SF-Pro-Rounded-Bold': require('../../assets/fonts/SF-Pro-Rounded-Bold.otf'),
    'SF-Pro-Rounded-Heavy': require('../../assets/fonts/SF-Pro-Rounded-Heavy.otf'),
    'SF-Compact-Rounded-Medium': require('../../assets/fonts/SF-Compact-Rounded-Medium.otf'),
    regular: require('../../assets/fonts/regular.ttf'),
    outfit: require('../../assets/fonts/outfit.ttf'),
    bold: require('../../assets/fonts/bold.ttf'),
    'AddingtonCF-Light': require('../../assets/fonts/AddingtonCF-Light.otf'),
    'FiraCode-Regular': require('../../assets/fonts/FiraCode-Regular.ttf'),
    FiraCodeMedium: require('../../assets/fonts/FiraCode-Medium.ttf'),
    'Honk-Regular': require('../../assets/fonts/honk-regular.otf'),
    'Honk-Bold': require('../../assets/fonts/honk-bold.otf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return <>{children}</>;
};
