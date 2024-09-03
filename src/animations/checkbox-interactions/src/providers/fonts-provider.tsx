import React, { useEffect, useState } from 'react';
import * as Font from 'expo-font';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sfProRoundedBold from '../../assets/fonts/SF-Pro-Rounded-Bold.otf';

type FontsProviderProps = {
  children: React.ReactNode;
};

export const FontsProvider: React.FC<FontsProviderProps> = React.memo(
  ({ children }) => {
    const [fontsLoaded, setFontsLoaded] = useState(false);

    // Load custom fonts using async Font.loadAsync
    useEffect(() => {
      (async () => {
        await Font.loadAsync({
          'SF-Pro-Rounded-Bold': sfProRoundedBold,
        });
        setFontsLoaded(true);
      })();
    }, []);

    if (!fontsLoaded) {
      return null;
    }
    return <>{children}</>;
  },
);
