import { StyleSheet, Text, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Checkbox } from './components/checkbox';
import { useCuisines } from './hooks/use-cuisines';

const App = () => {
  const { top: safeTop } = useSafeAreaInsets();
  const { cuisines, toggleCuisine } = useCuisines();

  return (
    <View style={[styles.container, { paddingTop: safeTop + 24 }]}>
      <Text style={styles.sectionTitle}>What are your favorite cuisines?</Text>
      <View style={styles.contentWrap}>
        {cuisines.map(cuisine => (
          <Checkbox
            key={cuisine.id}
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
});

export { App };
