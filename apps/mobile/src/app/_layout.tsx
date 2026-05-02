import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Slot, useRouter } from 'expo-router';
import { getAccessToken, getStoredUser } from '@/lib/auth/token-storage';

export default function RootLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [token, user] = await Promise.all([getAccessToken(), getStoredUser()]);
        if (token && user) router.replace('/(home)');
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);

  return (
    <View style={styles.root}>
      <Slot />
      {checking && (
        <View style={styles.splash}>
          <ActivityIndicator size="large" color="#FF6B2B" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF9E6',
  },
});
