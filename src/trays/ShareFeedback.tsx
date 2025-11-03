import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import { memo, useState } from 'react';

import { PressableScale } from 'pressto';

import { getAnimationMetadata } from '../animations/registry';
import { useRetray } from '../packages/retray';

interface ShareFeedbackProps {
  slug?: string;
}

export const ShareFeedback = memo(({ slug }: ShareFeedbackProps) => {
  const [feedbackText, setFeedbackText] = useState('');
  const { dismiss } = useRetray();

  const handleClose = () => {
    dismiss();
  };

  const handleSubmit = () => {
    const metadata = slug ? getAnimationMetadata(slug) : null;
    const animationName = metadata?.name || 'General';

    const title = slug ? `Feedback: ${animationName}` : 'Feedback';

    const contextLine = slug ? `Animation: ${animationName} (${slug})\n\n` : '';

    const body = `${contextLine}${feedbackText}`;
    const issueUrl = `https://github.com/enzomanuelmangano/demos/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

    Linking.openURL(issueUrl);
    handleClose();
  };

  const metadata = slug ? getAnimationMetadata(slug) : null;
  const placeholder = slug
    ? `Share your thoughts on ${metadata?.name || 'this animation'}...`
    : "What's on your mind?";

  return (
    <View style={styles.container}>
      {slug && metadata && (
        <View style={styles.contextCard}>
          <Text style={styles.contextLabel}>Providing feedback for</Text>
          <Text style={styles.contextValue}>{metadata.name}</Text>
        </View>
      )}
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#8E8E93"
        value={feedbackText}
        onChangeText={setFeedbackText}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        autoFocus
      />

      <View style={styles.buttonContainer}>
        <PressableScale style={styles.cancelButton} onPress={handleClose}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </PressableScale>

        <PressableScale style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>Send</Text>
        </PressableScale>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: '#3A3A3C',
    borderCurve: 'continuous',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  cancelButtonText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  contextCard: {
    backgroundColor: '#3A3A3C',
    borderCurve: 'continuous',
    borderRadius: 12,
    gap: 6,
    marginBottom: 16,
    padding: 14,
  },
  contextLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  contextValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#3A3A3C',
    borderCurve: 'continuous',
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: 16,
    minHeight: 140,
    padding: 16,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#4A90E2',
    borderCurve: 'continuous',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
