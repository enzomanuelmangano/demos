import { Stack } from 'expo-router';
import { getAnimationMetadata } from '../../src/animations/registry';

export default function AnimationsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: 'white',
        headerStyle: {
          backgroundColor: 'black',
        },
        headerTitleStyle: {
          color: 'white',
        },
      }}>
      <Stack.Screen
        name="[slug]"
        options={({ route }) => {
          const params = route.params as { slug?: string };
          const metadata = params?.slug
            ? getAnimationMetadata(params.slug)
            : null;

          return {
            title: metadata?.name || 'Animation',
            headerShown: true,
            // You can add more dynamic options based on metadata
            headerStyle: {
              backgroundColor: (metadata as any)?.backIconDark
                ? 'white'
                : 'black',
            },
            headerTintColor: (metadata as any)?.backIconDark
              ? 'black'
              : 'white',
            headerTitleStyle: {
              color: (metadata as any)?.backIconDark ? 'black' : 'white',
            },
          };
        }}
      />
    </Stack>
  );
}
