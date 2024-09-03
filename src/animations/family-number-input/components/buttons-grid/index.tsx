// Import necessary modules from React and React Native
import { FontAwesome5 } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Import the InputButton component
import { InputButton } from './input-button';

// Define an array of items representing buttons in the grid
const items = [
  { label: 1 },
  { label: 2 },
  { label: 3 },
  { label: 4 },
  { label: 5 },
  { label: 6 },
  { label: 7 },
  { label: 8 },
  { label: 9 },
  { label: null },
  { label: 0 },
  { label: 'backspace' },
];

// Define the props for the ButtonsGrid component
type ButtonsGridProps = {
  input: number;
  onUpdate: (value: number) => void;
  onBackspace?: (value: number) => void;
  onReset?: () => void;
  onMaxReached?: () => void;
};

// ButtonsGrid component definition
const ButtonsGrid: React.FC<ButtonsGridProps> = React.memo(
  ({ input, onReset, onUpdate, onBackspace, onMaxReached }) => {
    return (
      <View style={styles.container}>
        {/* Map through the items array to render individual buttons */}
        {items.map(({ label }, index) => {
          return (
            <InputButton
              key={index}
              style={styles.input}
              onLongTap={() => {
                // Handle long tap on the backspace button
                if (label === 'backspace') {
                  onReset?.();
                  return;
                }
              }}
              onTap={() => {
                // Handle tap on numeric buttons
                if (typeof label === 'number') {
                  const newValue = +`${input}${label}`;
                  // Check if the input length exceeds the limit
                  if (newValue.toString().length > 11) {
                    onMaxReached?.();
                    return;
                  }
                  onUpdate(+`${input}${label}`);
                  return;
                }
                // Handle tap on the backspace button
                if (label === 'backspace') {
                  onBackspace?.(Math.floor(input / 10));
                  return;
                }
              }}>
              {/* Render the numeric value or backspace icon based on the label */}
              {typeof label === 'number' && (
                <Text style={styles.number}>{label}</Text>
              )}
              {label === 'backspace' && (
                <FontAwesome5 name={label} size={24} color="white" />
              )}
            </InputButton>
          );
        })}
      </View>
    );
  },
);

// Styles for the ButtonsGrid component
const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  input: {
    width: '30%',
    height: '20%',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    marginLeft: 7 / 3 + '%',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    marginBottom: 7 / 3 + '%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  number: {
    textAlign: 'center',
    fontSize: 30,
    color: 'white',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
});

// Export the ButtonsGrid component
export { ButtonsGrid };
