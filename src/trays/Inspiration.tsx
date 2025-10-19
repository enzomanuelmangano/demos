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
    color: '#8E8E93',
    fontSize: 15,
    lineHeight: 22,
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
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#3A3A3C',
    borderCurve: 'continuous',
    borderRadius: 12,
    gap: 18,
    padding: 18,
  },
  infoRow: {
    gap: 6,
  },
  label: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  linkButton: {
    alignItems: 'center',
    backgroundColor: '#4A90E2',
    borderCurve: 'continuous',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 16,
  },
  linkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  noLinkCard: {
    alignItems: 'center',
    backgroundColor: '#3A3A3C',
    borderCurve: 'continuous',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 16,
  },
  noLinkText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
});
