import { View, StyleSheet, Text, TextInput, Alert } from 'react-native';

import { useCallback, useRef } from 'react';

import { AntDesign } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from 'pressto';
import { Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNotes } from '../atoms/notes';
import { Palette } from '../constants/theme';
import { useGLTransition } from '../providers/gl-transitions';

export const AddNoteScreen = () => {
  const { runTransition } = useGLTransition();
  const { goBack } = useNavigation();
  const [, setNotes] = useNotes();

  const noteText = useRef('');

  const updateText = useCallback((text: string) => {
    noteText.current = text;
  }, []);

  const onClose = useCallback(async () => {
    // Here's the magic 🤯
    await runTransition({
      duration: 1500,
      easing: Easing.linear,
    });

    setTimeout(() => {
      goBack();
    }, 1000);
  }, [runTransition, goBack]);

  const onSave = useCallback(async () => {
    if (!noteText.current) {
      // Here you can use a toast or alert to show the user that the note is empty
      // I usually like to use burnt (https://github.com/nandorojo/burnt)
      // But it's not supported on Expo Go and I don't want to add more complexity to this example
      Alert.alert('Empty Note', 'Please write something before saving');
      return;
    }

    // Here's the magic again 🤯
    await runTransition(
      {
        duration: 1500,
        easing: Easing.linear,
      },
      () => {
        setNotes(prev => {
          return [
            {
              id: (prev.length + 1).toString(),
              title: noteText.current,
            },
            ...prev,
          ];
        });
      },
    );
    setTimeout(() => {
      goBack();
    }, 1000);
  }, [goBack, runTransition, setNotes]);

  const { top: safeTop } = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Palette.background,
        paddingHorizontal: 8,
      }}>
      <LinearGradient
        // Background Linear Gradient
        colors={['rgba(255, 0, 0, 0.05)', 'transparent', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{
          flexDirection: 'row',
          paddingTop: safeTop + 16,
        }}>
        <PressableScale onPress={onClose} style={styles.button}>
          <AntDesign name="close" size={32} color={Palette.text} />
        </PressableScale>
        <View style={styles.fillCenter}>
          <Text
            style={{
              fontSize: 18,
              color: Palette.text,
            }}>
            Create a new Note
          </Text>
        </View>
        <PressableScale
          onPress={onSave}
          style={[
            styles.button,
            {
              backgroundColor: Palette.primary,
            },
          ]}>
          <AntDesign name="check" size={24} color="white" />
        </PressableScale>
      </View>
      <View style={styles.notesContainer}>
        <Text style={styles.inputHeader}>Add a new note</Text>
        <TextInput
          onChangeText={updateText}
          placeholder="Write your ideas here..."
          style={styles.inputText}
          selectionColor={Palette.primary}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    aspectRatio: 1,
    borderCurve: 'continuous',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
  },
  fillCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  inputHeader: {
    color: Palette.primary,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  inputText: {
    color: Palette.text,
    fontSize: 20,
    marginTop: 16,
  },
  notesContainer: {
    backgroundColor: Palette.surface,
    borderCurve: 'continuous',
    borderRadius: 8,
    marginTop: 16,
    minHeight: 200,
    padding: 16,
  },
});
