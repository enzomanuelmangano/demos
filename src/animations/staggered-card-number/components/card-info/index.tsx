// Import necessary modules from React and React Native libraries
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';

// Import custom component for touchable feedback
import { TouchableFeedback } from '../touchables/touchable-feedback';

// Import custom component to hide numbers
import { HideableNumber } from './hideable-number';

// Define the props type for CardInfo component
type CardInfoProps = {
  cardNumber: number;
};

// Define the CardInfo component
export const CardInfo: React.FC<CardInfoProps> = React.memo(
  ({ cardNumber }) => {
    // Split the card number into individual digits
    const splittedNumber = cardNumber.toString().split('');

    // State to toggle visibility of card number
    const [toggled, setToggled] = useState(false);

    // Derived value to determine which indexes to hide
    const hiddenIndexes = useDerivedValue(() => {
      if (toggled) {
        // If toggled, hide all numbers except the last 4
        return Array.from({ length: 12 }, (_, index) => index);
      }
      // If not toggled, show all numbers
      return [];
    }, [toggled]);

    // Callback function to toggle visibility
    const onToggle = useCallback(() => {
      setToggled(prev => !prev);
    }, []);

    // Render the CardInfo component
    return (
      <View style={styles.container}>
        <View>
          {/* Title */}
          <Text style={styles.title}>Number</Text>
          {/* Display Card Info */}
          <View style={styles.numbers}>
            {splittedNumber.map((number, index) => {
              return (
                <View
                  key={index}
                  style={{
                    marginRight: index !== 0 && (index + 1) % 4 === 0 ? 8 : 0,
                  }}>
                  {/* Individual digit with hideable feature */}
                  <HideableNumber
                    number={number}
                    hiddenIndexes={hiddenIndexes}
                    index={index}
                  />
                </View>
              );
            })}
          </View>
        </View>
        <View style={{ flex: 1 }} />
        {/* Toggle button for visibility */}
        <TouchableFeedback onTap={onToggle} style={styles.button}>
          <Feather
            name={toggled ? 'eye' : 'eye-off'}
            size={24}
            color="#38a27b"
          />
        </TouchableFeedback>
      </View>
    );
  },
);

// Styles for CardInfo component
const styles = StyleSheet.create({
  container: {
    height: 80,
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 20,
    paddingHorizontal: 25,
    paddingTop: 15,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    flexDirection: 'row',
  },
  title: {
    fontSize: 17,
    color: '#787878',
    fontWeight: '400',
  },
  button: {
    height: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numbers: {
    flexDirection: 'row',
    marginTop: 5,
  },
});
