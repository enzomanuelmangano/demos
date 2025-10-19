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
        placeholderTextColor="#aaa"
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
    backgroundColor: 'transparent',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 15,
  },
  container: {
    flex: 1,
  },
  input: {
    backgroundColor: 'transparent',
    color: '#000',
    fontSize: 15,
    minHeight: 140,
    padding: 0,
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
    fontSize: 15,
    fontWeight: '500',
  },
});
