import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sections } from './constants';
import { SectionContentList } from './section-content-list';

export function ScrollProgress() {
  const insets = useSafeAreaInsets();

  const renderSection = useCallback(
    (item: (typeof sections)[0], index: number) => {
      return (
        <View key={index} style={styles.textContainer}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.description}>{item.description}</Text>
        </View>
      );
    },
    [],
  );

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <SectionContentList
        sections={sections}
        renderSection={renderSection}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 100,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  textContainer: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#EEE',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: '#999',
  },
});
