import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  getAnimationComponent,
  getAnimationMetadata,
} from '../../src/animations/registry';

export default function AnimationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const dimensions = useWindowDimensions();

  if (!slug) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No animation specified</Text>
      </View>
    );
  }

  const AnimationComponent = getAnimationComponent(slug);
  const metadata = getAnimationMetadata(slug);

  if (!AnimationComponent || !metadata) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Animation "{slug}" not found</Text>
      </View>
    );
  }

  // Render the component - use type assertion since components have different prop signatures
  // Some expect dimensions, some expect no props, some expect other props
  return <AnimationComponent {...(dimensions as any)} />;
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  errorText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
});
