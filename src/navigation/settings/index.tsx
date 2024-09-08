import { Image } from 'expo-image';
import { View } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AppIcon = require('../../../assets/icon.png');

export const Settings = () => {
  return (
    <View style={{ flex: 1, backgroundColor: '#111111', paddingTop: 32 }}>
      <Image
        source={AppIcon}
        style={{
          width: 128,
          height: 128,
          borderRadius: 24,
          alignSelf: 'center',
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          borderCurve: 'continuous',
        }}
      />
    </View>
  );
};
