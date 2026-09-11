import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { api, ApiRequestError } from '@/lib/api';

type ConnectionState =
  | { kind: 'loading' }
  | { kind: 'connected'; database: 'connected' | 'disconnected' }
  | { kind: 'error'; message: string };

/** Same purpose as the desktop dashboard's status banner: prove the app can
 * reach the API before showing data that depends on it. */
export function ConnectionBanner() {
  const [state, setState] = useState<ConnectionState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((res) => {
        if (!cancelled) setState({ kind: 'connected', database: res.database });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiRequestError ? err.message : 'Cannot reach the API server';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.banner, state.kind === 'error' ? styles.error : styles.ok]}>
      <Text style={styles.text}>
        {state.kind === 'loading' && 'Checking connection…'}
        {state.kind === 'connected' && `Connected — database ${state.database}`}
        {state.kind === 'error' && `Server unreachable: ${state.message}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
  },
  ok: {
    backgroundColor: '#eafaf4',
  },
  error: {
    backgroundColor: '#fdecec',
  },
  text: {
    fontSize: 13,
  },
});
