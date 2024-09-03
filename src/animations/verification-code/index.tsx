import { useEffect, useState } from 'react';
import * as Font from 'expo-font';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import firacode from './assets/fonts/firacode.ttf';
import { VerificationCodeScreen } from './screens/verification-code';

const App = () => {
  return <VerificationCodeScreen correctCode={31415} />;
};

export const VerificationCode = () => {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // Load custom fonts using async Font.loadAsync
  useEffect(() => {
    (async () => {
      await Font.loadAsync({
        // I want to use a Mono font for the verification code :)
        FiraCode: firacode,
      });
      setFontsLoaded(true);
    })();
  }, []);

  return (
    // Because we're using the PressableScale :) (based on a GestureDetector)
    <>{fontsLoaded && <App />}</>
  );
};
