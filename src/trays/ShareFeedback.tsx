import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import { useState } from 'react';

import { PressableScale } from 'pressto';

import { useRetray } from '../packages/retray';

export const ShareFeedback = () => {
  const [feedbackText, setFeedbackText] = useState('');
  const { dismiss } = useRetray();

  const handleClose = () => {
    dismiss();
  };

  const handleSubmit = () => {
    const subject = 'Reactiive Demos Feedback';
    const body = feedbackText || '';
    const mailtoUrl = `mailto:hello@reactiive.io?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    Linking.openURL(mailtoUrl);
    handleClose();
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="What's on your mind?"
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
};

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
