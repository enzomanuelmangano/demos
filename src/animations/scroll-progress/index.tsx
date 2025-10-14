import { StyleSheet, Text, View } from 'react-native';

import { useCallback } from 'react';

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
        contentContainerStyle={styles.contentContainer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 100,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  description: {
    color: '#999',
    fontSize: 14,
  },
  textContainer: {
    marginBottom: 20,
  },
  title: {
    color: '#EEE',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});
