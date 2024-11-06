import { useCallback } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { sections } from './constants';
import { SectionContentList } from './section-content-list';

export function ScrollProgress() {
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
    <SafeAreaView style={styles.container}>
      <SectionContentList
        sections={sections}
        renderSection={renderSection}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 100,
        }}
      />
    </SafeAreaView>
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
