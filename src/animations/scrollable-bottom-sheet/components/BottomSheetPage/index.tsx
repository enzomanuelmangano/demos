import React from 'react';
import { View, useWindowDimensions, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { PressableScale } from '../TouchableScale';

// Define the props for the BottomSheetPage component
type BottomSheetPageProps = {
  onPress?: () => void; // Function to handle press event
  gradientColors?: string[]; // Array of gradient colors
  buttonTitle?: string; // Title text for the button
};

// Create the BottomSheetPage component
const BottomSheetPage: React.FC<BottomSheetPageProps> = ({
  onPress,
  gradientColors = ['#4E65FF', '#92EFFD'],
  buttonTitle = 'Tap Here', // Default button title
}) => {
  // Get the window width using React Native's useWindowDimensions
  const { width: windowWidth } = useWindowDimensions();

  return (
    <View
      style={[
        styles.container, // Apply the styles defined in the container object
        {
          width: windowWidth, // Set the width to the window's width
        },
      ]}>
      <PressableScale onPress={onPress}>
        <LinearGradient
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          colors={gradientColors} // Apply gradient colors
          style={styles.button}>
          <Text style={styles.buttonText}>{buttonTitle}</Text>
        </LinearGradient>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    height: 50,
    width: 200,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export { BottomSheetPage };
