import { StyleSheet, Text, View } from 'react-native';

import { spacing } from '../../../../constants';

export const MainPage = () => {
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identity Verification</Text>
        <Text style={styles.sectionText}>
          Our identity verification process checks a person's information
          against trusted third-party sources or a government ID. The process
          has safeguards but doesn't guarantee that someone is who they say they
          are.
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trust & Safety</Text>
        <Text style={styles.sectionText}>
          Building trust in our community is essential. Verified identities help
          create safer, more reliable experiences for everyone.
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
