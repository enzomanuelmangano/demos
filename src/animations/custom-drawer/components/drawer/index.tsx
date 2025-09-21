import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useCallback } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerListItem } from './drawer-list-item';

const CustomDrawer = ({ state }: DrawerContentComponentProps) => {
  const { top } = useSafeAreaInsets();

  // Get the navigation object using the useNavigation hook
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();

  // Define the onPress function to navigate to the selected route
  const onPress = useCallback(
    (route: string) => {
      navigation.navigate(route);
    },
    [navigation],
  );

  // Render the CustomDrawer component
  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <Text style={styles.heading}>Drawer</Text>
      {/* Map over the routeNames and render a DrawerListItem for each item */}
      {state.routeNames.map(item => {
        return (
          <DrawerListItem
            key={item}
            label={item}
            onPress={() => onPress(item)}
          />
        );
      })}
    </View>
  );
};

// Define the styles using StyleSheet.create
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  heading: {
    color: 'white',
    fontWeight: '600',
    textTransform: 'uppercase',
    fontSize: 20,
    letterSpacing: 5,
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 35,
  },
});

// Export the CustomDrawer component
export * from './drawer-icon';
export { CustomDrawer };
