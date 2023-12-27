import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider, useMutation } from 'react-query';
import { useRef } from 'react';

// Custom button component
import { LoadingButton } from './components/loading-button';

// Helper function: waits for a given timeout (in milliseconds) before resolving
const wait = async (timeout: number) => {
  return new Promise(resolve => setTimeout(resolve, timeout));
};

const App = () => {
  // useRef hook maintains the reference of `i` across component re-renders
  const i = useRef(0);

  // useMutation hook is for executing async mutations (like data updates). It returns the mutation status and other handlers
  const { status, mutateAsync, reset } = useMutation(
    async () => {
      // Every second call results in an error. Otherwise, it waits for 2 seconds before resolving.
      if (i.current % 2 === 0) {
        i.current++;
        return wait(2000);
      }
      await wait(2000);
      i.current++;
      throw new Error('Transaction Unsafe');
    },
    {
      // After the mutation succeeds, wait for 1.5 seconds and then reset its status
      onSuccess: async () => {
        wait(1500).then(() => {
          reset();
        });
      },
      // After the mutation fails, wait for 1.5 seconds and then reset its status
      onError: async () => {
        wait(1500).then(() => {
          reset();
        });
      },
    },
  );

  // Component render
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <LoadingButton
        status={status}
        onPress={async () => {
          await mutateAsync();
        }}
        // Style properties for the LoadingButton
        style={{
          height: 60,
          borderRadius: 25,
        }}
        // Colors for button based on its status (idle, loading, success, error)
        colorFromStatusMap={{
          idle: '#47A1E6',
          loading: '#47A1E6',
          success: '#5BC682',
          error: '#CD5454',
        }}
        // Titles (text) for button based on its status
        titleFromStatusMap={{
          idle: 'Check Transaction',
          loading: 'Analyzing Transaction',
          success: 'Transaction Safe',
          error: 'Transaction Unsafe',
        }}
      />
    </View>
  );
};

// Configuration for the React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // Retry failed queries once
      retryDelay: 5000, // Delay retries by 5 seconds
      refetchOnWindowFocus: false, // Do not refetch on window focus
      refetchOnMount: false, // Do not refetch when component mounts
      suspense: false,
      useErrorBoundary: false,
    },
  },
});

// Main application container wrapping the App in necessary providers
const AppContainer = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <App />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
};

// Styles definition
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Export the AppContainer as the default App component
export { AppContainer as LoadingButton };
