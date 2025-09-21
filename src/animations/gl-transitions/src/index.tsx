import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View } from 'react-native';

import { HomeScreen } from './screens/home-screen';
import { AddNoteScreen } from './screens/add-note-screen';
import { GLTransitionsProvider } from './providers/gl-transitions';
import { Palette } from './constants/theme';
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
            <NavigationContainer>
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
            </NavigationContainer>
          </GLTransitionsProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
};

export { App };
