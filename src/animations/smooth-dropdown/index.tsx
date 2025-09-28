import { StyleSheet, View } from 'react-native';

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
  return (
    <View style={styles.container}>
      <Dropdown
        options={options}
        header={{ label: 'Header', iconName: 'ellipsis' }}
        onPick={val => {
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
});
