import { StyleSheet, View } from 'react-native';

// @@TODO: restore once available in pressto
// import { PressableGlass } from 'pressto/glass';
import { PressableScale } from 'pressto';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDemoStackedToast } from './hook';
import { DEMO_BUTTON_ROW_HEIGHT } from '../../../navigation/home/demo-close-button';

const App = () => {
  const { onPress } = useDemoStackedToast();
  const { top: safeTop } = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          // Below the demo's close and info buttons.
          paddingTop: safeTop + DEMO_BUTTON_ROW_HEIGHT,
        }}>
        {new Array(10).fill(null).map((_, index) => (
          <PressableScale
            key={index}
            onPress={onPress}
            style={styles.listItem}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fefefe',
    flex: 1,
  },
  listItem: {
    backgroundColor: 'black',
    borderCurve: 'continuous',
    borderRadius: 20,
    height: 100,
    marginHorizontal: 20,
    marginVertical: 10,
  },
});

export { App };
