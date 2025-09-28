import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useCallback } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerListItem } from './drawer-list-item';

const CustomDrawer = ({ state }: DrawerContentComponentProps) => {
  const { top } = useSafeAreaInsets();

  const navigation = useNavigation<any>();

  const onPress = useCallback(
    (route: string) => {
      navigation.navigate(route);
    },
    [navigation],
  );

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <Text style={styles.heading}>Drawer</Text>
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

export * from './drawer-icon';
export { CustomDrawer };
