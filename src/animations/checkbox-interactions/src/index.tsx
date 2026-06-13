import { StyleSheet, Text, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Checkbox } from './components/checkbox';
import { useCuisines } from './hooks/use-cuisines';

const App = () => {
  const { top: safeTop } = useSafeAreaInsets();
  const { cuisines, toggleCuisine } = useCuisines();

  // e2e outcome probe: exposes how many checkboxes are currently checked (the
  // checkmark is a spring-animated Skia/Reanimated view). Near-invisible.
  const checkedCount = cuisines.filter(cuisine => cuisine.selected).length;

  return (
    <View style={[styles.container, { paddingTop: safeTop + 24 }]}>
      <Text testID="checkbox-interactions-status" style={styles.statusProbe}>
        {`checked:${checkedCount}`}
      </Text>
      <Text style={styles.sectionTitle}>What are your favorite cuisines?</Text>
      <View style={styles.contentWrap}>
        {cuisines.map((cuisine, index) => (
          <Checkbox
            key={cuisine.id}
            testID={`checkbox-interactions-item-${index}`}
            label={cuisine.name}
            checked={cuisine.selected}
            onPress={() => {
              toggleCuisine(cuisine.id);
            }}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0C0A0C',
    flex: 1,
    paddingLeft: 12,
  },
  contentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 24,
  },
  sectionTitle: {
    color: 'white',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 24,
  },
  // Near-invisible to the eye, but on-screen for the e2e accessibility tree.
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#FFFFFF',
    opacity: 0.012,
    zIndex: 10,
  },
});

export { App };
