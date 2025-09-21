import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRef, useState, useCallback, useEffect } from 'react';

// Custom button component
import { LoadingButton } from './components/loading-button';

// Helper function: waits for a given timeout (in milliseconds) before resolving
const wait = async (timeout: number) => {
  return new Promise(resolve => setTimeout(resolve, timeout));
};

// Custom hook to manage async mutation state
const useMutation = () => {
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mutateAsync = useCallback(
    async (mutationFn: () => Promise<void>) => {
      // Prevent multiple simultaneous mutations
      if (isLoading) {
        return;
      }

      try {
        setIsLoading(true);
        setStatus('loading');
        await mutationFn();
        setStatus('success');
      } catch (error) {
        setStatus('error');
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus('idle');
    setIsLoading(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { status, mutateAsync, reset, isLoading, timeoutRef };
};

const App = () => {
  // useRef hook maintains the reference of `i` across component re-renders
  const i = useRef(0);

  // Custom mutation hook to manage async operations with status tracking
  const { status, mutateAsync, reset, isLoading, timeoutRef } = useMutation();

  const handleMutation = useCallback(async () => {
    // Every second call results in an error. Otherwise, it waits for 2 seconds before resolving.
    if (i.current % 2 === 0) {
      i.current++;
      await wait(2000);
    } else {
      await wait(2000);
      i.current++;
      throw new Error('Transaction Unsafe Example');
    }
  }, []);

  const handlePress = useCallback(async () => {
    // Prevent handling press if already loading
    if (isLoading) {
      return;
    }

    try {
      await mutateAsync(handleMutation);
      // After success, wait for 1.5 seconds and then reset status
      timeoutRef.current = setTimeout(() => {
        reset();
      }, 1500);
    } catch (error) {
      // After error, wait for 1.5 seconds and then reset status
      timeoutRef.current = setTimeout(() => {
        reset();
      }, 1500);
    }
  }, [mutateAsync, handleMutation, reset, isLoading, timeoutRef]);

  // Component render
  return (
    <View style={styles.container}>
      <LoadingButton
        status={status}
        onPress={handlePress}
        // Style properties for the LoadingButton
        style={{
          height: 40,
          borderRadius: 16,
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

// Main application container
const AppContainer = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <App />
    </GestureHandlerRootView>
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
