import { StyleSheet, Text, View } from 'react-native';

import { spacing } from '../../../../constants';

export const SecondPage = () => {
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Overview</Text>
        <Text style={styles.sectionText}>
          Your complete profile showcases your journey, including stats,
          personal information, and places visited. This transparency helps
          build trust within our community.
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Community Engagement</Text>
        <Text style={styles.sectionText}>
          Through reviews, recommendations, and respectful interactions, you
          contribute to creating better experiences for everyone in our global
          community.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xxl,
  },
  section: {
    backgroundColor: 'transparent',
    borderCurve: 'continuous',
    borderRadius: spacing.m,
    marginBottom: spacing.m,
    paddingVertical: spacing.s,
  },
  sectionText: {
    color: '#1A1D29',
    fontFamily: 'regular',
    fontSize: 16,
    lineHeight: 24,
  },
  sectionTitle: {
    color: '#000000',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 20,
    marginBottom: spacing.s,
  },
});
