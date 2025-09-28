import { Text, StyleSheet, View } from 'react-native';

import { useCallback } from 'react';

import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerListItem } from './drawer-list-item';

import type { DrawerContentComponentProps } from '@react-navigation/drawer';

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
    backgroundColor: '#111',
    flex: 1,
  },
  heading: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 5,
    marginBottom: 35,
    marginTop: 7,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});

export * from './drawer-icon';
export { CustomDrawer };
