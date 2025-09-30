import { StyleSheet, Text } from 'react-native';

import { FC } from 'react';

import { Header as RNHeader } from '@codeherence/react-native-header';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { PressableScale } from 'pressto';
import { useSharedValue } from 'react-native-reanimated';

type Props = {
  name: string;
};

const Header: FC<Props> = ({ name }) => {
  const navigation = useNavigation();
  const showNavBar = useSharedValue(1);

  return (
    <RNHeader
      showNavBar={showNavBar}
      headerLeft={
        <PressableScale
          hitSlop={15}
          onPress={() => (navigation as any).toggleDrawer()}>
          <Feather name="arrow-left" size={20} color="black" />
        </PressableScale>
      }
      headerStyle={styles.header}
      headerCenter={<Text style={styles.title}>{name}</Text>}
    />
  );
};

const styles = StyleSheet.create({
  header: {
    marginVertical: 8,
  },
  title: {
    color: 'black',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export { Header };
