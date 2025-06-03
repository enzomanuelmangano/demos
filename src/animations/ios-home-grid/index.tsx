import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AppsList } from './apps-list';
import { AppDetailScreen, type RootStackParamList } from './app-detail-screen';
import { ExpansionProvider } from './navigation/expansion-provider';
import { withDetailScreenWrapper } from './navigation/DetailScreenWrapper';
import { withMainScreenWrapper } from './navigation/MainScreenWrapper';

const Stack = createNativeStackNavigator<RootStackParamList>();

const iOSHomeGrid = () => {
  return (
    <ExpansionProvider>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}>
        <Stack.Screen name="Home" component={withMainScreenWrapper(AppsList)} />
        <Stack.Screen
          name="AppDetail"
          component={withDetailScreenWrapper(AppDetailScreen)}
          options={{
            animation: 'none',
          }}
        />
      </Stack.Navigator>
    </ExpansionProvider>
  );
};

export { iOSHomeGrid };
