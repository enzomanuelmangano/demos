import { StyleSheet, View } from 'react-native';

import { useRef, useState, useCallback, useEffect } from 'react';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LoadingButton } from './components/loading-button';

const wait = async (timeout: number) => {
  return new Promise(resolve => setTimeout(resolve, timeout));
};

const useMutation = () => {
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mutateAsync = useCallback(
    async (mutationFn: () => Promise<void>) => {
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
  const i = useRef(0);

  const { status, mutateAsync, reset, isLoading, timeoutRef } = useMutation();

  const handleMutation = useCallback(async () => {
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
    if (isLoading) {
      return;
    }

    try {
      await mutateAsync(handleMutation);
      timeoutRef.current = setTimeout(() => {
        reset();
      }, 1500);
    } catch (error) {
      timeoutRef.current = setTimeout(() => {
        reset();
      }, 1500);
    }
  }, [mutateAsync, handleMutation, reset, isLoading, timeoutRef]);

  return (
    <View style={styles.container}>
      <LoadingButton
        status={status}
        onPress={handlePress}
        style={{
          height: 40,
          borderRadius: 16,
        }}
        colorFromStatusMap={{
          idle: '#47A1E6',
          loading: '#47A1E6',
          success: '#5BC682',
          error: '#CD5454',
        }}
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

const AppContainer = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <App />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
});

export { AppContainer as LoadingButton };
