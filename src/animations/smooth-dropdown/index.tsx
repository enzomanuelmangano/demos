import { StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';

import { Dropdown } from './components/dropdown';

import type { DropdownOptionType } from './components/dropdown/dropdrop-item';

// Defining the options to be passed down to the Dropdown component (except the header option)
// All the iconName values are from the expo/vector-icons package (AntDesign)
const options: DropdownOptionType[] = [
  { label: 'Charts', iconName: 'bar-chart' },
  { label: 'Book', iconName: 'book' },
  { label: 'Calendar', iconName: 'calendar' },
  { label: 'Camera', iconName: 'camera' },
];

export const SmoothDropdown = () => {
  // e2e outcome probe: surfaces the picked option as an assertable value so a
  // test can verify the dropdown selection actually fired. Visually negligible.
  const [picked, setPicked] = useState('none');

  return (
    <View style={styles.container}>
      <Text testID="smooth-dropdown-status" style={styles.statusProbe}>
        {`picked:${picked}`}
      </Text>
      <Dropdown
        options={options}
        header={{ label: 'Header', iconName: 'ellipsis' }}
        onPick={val => {
          setPicked(val.label.toLowerCase());
          console.log({
            val,
          });
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    color: '#fff',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
  },
});
