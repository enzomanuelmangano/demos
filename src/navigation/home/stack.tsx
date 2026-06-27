import 'react-native-reanimated';
import { createBlankStackNavigator } from 'react-native-screen-transitions/blank-stack';

// The launcher runs as a STANDALONE navigation tree (see launcher.tsx), not
// bridged into expo-router — on SDK 56 expo-router vendors its own
// react-navigation, so a withLayoutContext bridge can't share the container
// (SingleNavigatorContext mismatch). A self-contained NavigationContainer +
// this blank stack (the package's full-control JS stack) drives the open-zoom.
export const DemoStack = createBlankStackNavigator();
