import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useState } from 'react';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { getAnimationMetadata } from '../src/animations/registry';

export default function FeedbackScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const [feedbackText, setFeedbackText] = useState('');

  const metadata = slug ? getAnimationMetadata(slug) : null;
  const animationName = metadata?.name || 'Unknown Animation';

  const handleClose = () => {
    router.back();
  };

  const handleSubmit = () => {
    const subject = slug
      ? `Feedback on ${animationName} (${slug})`
      : 'Reactiive Demos Feedback';
    const body = feedbackText || '';
    const mailtoUrl = `mailto:hello@reactiive.io?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    Linking.openURL(mailtoUrl);
    handleClose();
  };

  return (
    <View
      style={[
        styles.modalContainer,
        {
          paddingTop: 20,
        },
      ]}>
      <View style={styles.pullIndicator} />

      <View style={styles.header}>
        <Text style={styles.title}>Send Feedback</Text>
        <Text style={styles.subtitle}>
          {slug
            ? `Feedback for ${animationName}`
            : 'Shake your device anytime to send feedback'}
        </Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="What's on your mind?"
        placeholderTextColor="#aaa"
        value={feedbackText}
        onChangeText={setFeedbackText}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        autoFocus
      />

      <View style={styles.buttonContainer}>
        <Pressable style={styles.cancelButton} onPress={handleClose}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>

        <Pressable style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderCurve: 'continuous',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  cancelButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '500',
  },
  header: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#fafafa',
    borderColor: '#eee',
    borderCurve: 'continuous',
    borderRadius: 10,
    borderWidth: 1,
    color: '#000',
    fontSize: 16,
    minHeight: 120,
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#fff',
    flex: 1,
    paddingHorizontal: 20,
    width: '100%',
  },
  pullIndicator: {
    alignSelf: 'center',
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    height: 4,
    marginBottom: 24,
    width: 36,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#000',
    borderCurve: 'continuous',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  title: {
    color: '#000',
    fontSize: 22,
    fontWeight: '600',
  },
});
