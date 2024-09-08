import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AppIcon = require('../../../assets/icon.png');

const AppHeader = () => (
  <>
    <Image
      source={AppIcon}
      style={{
        width: 128,
        height: 128,
        borderRadius: 24,
        alignSelf: 'center',
      }}
    />
    <Text
      style={{
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: 'FiraCode-Regular',
        textAlign: 'center',
        marginTop: 24,
      }}>
      Patreon Demos
    </Text>
  </>
);

const SettingsItem = ({ icon, text }: { icon: string; text: string }) => (
  <View
    style={{
      padding: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    }}>
    <View
      style={{
        height: 24,
        width: 24,
        backgroundColor: 'red',
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Feather name={icon} size={14} color="white" />
    </View>
    <Text
      style={{
        color: 'white',
        fontSize: 16,
        fontFamily: 'FiraCode-Regular',
      }}>
      {text}
    </Text>
    <View
      style={{
        position: 'absolute',
        height: 1,
        width: '93%',
        backgroundColor: '#333333',
        bottom: 0,
        right: 0,
      }}
    />
  </View>
);

const SettingsContainer = ({ children }: { children: React.ReactNode }) => (
  <View
    style={{
      backgroundColor: '#262626',
      marginTop: 32,
      marginHorizontal: 24,
      overflow: 'hidden',
      paddingVertical: 12,
      paddingLeft: 12,
      borderRadius: 15,
      borderCurve: 'continuous',
    }}>
    {children}
  </View>
);

export const Settings = () => {
  return (
    <View style={{ flex: 1, backgroundColor: '#111111', paddingTop: 48 }}>
      <AppHeader />
      <SettingsContainer>
        <SettingsItem icon="code" text="Source code access" />
        <SettingsItem icon="code" text="Source code access" />
        <SettingsItem icon="code" text="Source code access" />
      </SettingsContainer>
    </View>
  );
};
