import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from 'pressto';
import { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import type { ScrollableBottomSheetRef } from './components/BottomSheet/ScrollableBottomSheet';
import { ScrollableBottomSheet } from './components/BottomSheet/ScrollableBottomSheet';
import { BottomSheetPage } from './components/BottomSheetPage';

// Define the expected heights for the pages
const FIRST_PAGE_HEIGHT = 350;
const SECOND_PAGE_HEIGHT = 500;
const THIRD_PAGE_HEIGHT = 250;

function App() {
  // Create a ref for the ScrollableBottomSheet component
  const ref = useRef<ScrollableBottomSheetRef>(null);

  // Function to handle button press
  const onPress = useCallback(() => {
    const isActive = ref.current?.isActive();
    if (isActive) {
      // If the bottom sheet is active, close it
      ref.current?.close();
    } else {
      // If not active, scroll to the first page
      ref.current?.scrollToY(-FIRST_PAGE_HEIGHT);
    }
  }, []);

  // Get the window width
  const { width: windowWidth } = useWindowDimensions();

  // Define and memoize the pages
  // Feel free to put your own components here :)
  const pages = useMemo(
    () => [
      {
        height: FIRST_PAGE_HEIGHT,
        component: (
          <BottomSheetPage
            key={'FirstPage'}
            onPress={() => {
              ref.current?.scrollToX(windowWidth);
            }}
            buttonTitle="Next Page"
          />
        ),
      },
      {
        height: SECOND_PAGE_HEIGHT,
        component: (
          <BottomSheetPage
            key={'SecondPage'}
            onPress={() => {
              ref.current?.scrollToX(windowWidth * 2);
            }}
            buttonTitle="Next Page"
          />
        ),
      },
      {
        height: THIRD_PAGE_HEIGHT,
        component: (
          <BottomSheetPage
            key="ThirdPage"
            onPress={() => {
              ref.current?.close();
            }}
            buttonTitle="Close"
          />
        ),
      },
    ],
    [windowWidth],
  );

  return (
    <View style={styles.container}>
      {/* Button for opening/closing the bottom sheet */}
      <PressableScale style={styles.button} onPress={onPress}>
        <LinearGradient style={{ flex: 1 }} colors={['#4E65FF', '#92EFFD']} />
      </PressableScale>
      {/* ScrollableBottomSheet with memoized pages */}
      <ScrollableBottomSheet ref={ref} pages={pages} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    height: 50,
    borderRadius: 25,
    aspectRatio: 1,
    overflow: 'hidden',
  },
});

export { App as ScrollableBottomSheet };
