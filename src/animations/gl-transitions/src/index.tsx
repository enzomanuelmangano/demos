import { View } from 'react-native';

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Palette } from './constants/theme';
import { GLTransitionsProvider } from './providers/gl-transitions';
import { AddNoteScreen } from './screens/add-note-screen';
import { HomeScreen } from './screens/home-screen';
// use the others!
import {
  DirectionalWarp,
  // LinearBlur,
  // CrossZoom,
  // Hexagonalize,
} from './the-magic';

const Stack = createNativeStackNavigator();

const App = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          backgroundColor: Palette.background,
        }}>
        <SafeAreaProvider>
          {/* 
            IMPORTANT: 
            - The beauty here is that you can change easily the Transition
            - Replace here: DirectionalWarp with CrossZoom for instance. 
            
            You can also create your own transitions using the GLSL language.
            Let's be honest, nobody nows GLSL 👀, but you can copy and paste from the examples.
            Here they are: https://gl-transitions.com/gallery
           */}
          <GLTransitionsProvider transition={DirectionalWarp}>
            <Stack.Navigator
              initialRouteName="Home"
              screenOptions={{
                headerShown: false,
              }}>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Group
                screenOptions={{
                  presentation: 'containedModal',
                }}>
                <Stack.Screen name="AddNote" component={AddNoteScreen} />
              </Stack.Group>
            </Stack.Navigator>
          </GLTransitionsProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
};

export { App };
