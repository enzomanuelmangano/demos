import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import { SegmentedControl } from './components/segmented-control';

const Data: {
  name: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { name: 'Accounts', icon: 'wallet-outline' },
  { name: 'Deposits', icon: 'bank' },
  { name: 'Funds', icon: 'chart-bar' },
];

const App = () => {
  const [selected, setSelected] = useState(Data[0]);
  const { width: windowWidth } = useWindowDimensions();

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <SegmentedControl
        data={Data}
        onPress={item => setSelected(item)}
        selected={selected}
        width={windowWidth - 40}
        height={50}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { App };
