import { View, StyleSheet, Text, Linking } from 'react-native';

import { PressableScale } from 'pressto';

import { AnimationInspirations } from '../animations/inspirations';

interface InspirationProps {
  slug?: string;
}

export const Inspiration = ({ slug }: InspirationProps) => {
  const inspiration = slug ? AnimationInspirations[slug] : null;

  if (!slug || !inspiration) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Inspiration</Text>
          <Text style={styles.emptyDescription}>
            This animation doesn't have an inspiration reference yet.
          </Text>
        </View>
      </View>
    );
  }

  const { authorName, link } = inspiration;

  return (
    <View style={styles.container}>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Animation</Text>
          <Text style={styles.value}>{slug}</Text>
        </View>

        {authorName && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Inspired by</Text>
            <Text style={styles.value}>{authorName}</Text>
          </View>
        )}
      </View>

      {link && (
        <PressableScale
          style={styles.linkButton}
          onPress={() => Linking.openURL(link)}
        >
          <Text style={styles.linkButtonText}>View Original</Text>
        </PressableScale>
      )}

      {!link && authorName && (
        <View style={styles.noLinkCard}>
          <Text style={styles.noLinkText}>
            No link available
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyDescription: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: '#000',
    fontSize: 16,
    fontWeight: '500',
  },
  infoCard: {
    backgroundColor: 'transparent',
    borderBottomColor: '#f0f0f0',
    borderBottomWidth: 1,
    gap: 20,
    paddingBottom: 20,
  },
  infoRow: {
    gap: 6,
  },
  label: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
  },
  linkButton: {
    alignItems: 'center',
    backgroundColor: '#000',
    borderCurve: 'continuous',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 14,
  },
  linkButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  noLinkCard: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 14,
  },
  noLinkText: {
    color: '#999',
    fontSize: 13,
  },
  value: {
    color: '#000',
    fontSize: 15,
    fontWeight: '400',
  },
});
