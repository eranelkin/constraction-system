import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { getAccessToken, getStoredUser } from '@/lib/auth/token-storage';
import { ms } from '@/lib/responsive';

export default function HomeScreen() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const [token, user] = await Promise.all([getAccessToken(), getStoredUser()]);
      if (token && user) router.replace('/(home)' as never);
    })();
  }, [router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Constractor</Text>
      <Text style={styles.subtitle}>Contractor management platform</Text>
      <View style={styles.nav}>
        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Login</Text>
          </Pressable>
        </Link>
        <Link href="/(auth)/register" asChild>
          <Pressable style={[styles.button, styles.buttonSecondary]}>
            <Text style={styles.buttonText}>Register</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: ms(24) },
  title: { fontSize: ms(30), fontWeight: '700', marginBottom: ms(8) },
  subtitle: { fontSize: ms(15), color: '#666', marginBottom: ms(32) },
  nav: { gap: ms(12), width: '100%' },
  button: { backgroundColor: '#0070f3', padding: ms(15), borderRadius: ms(8), alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#333' },
  buttonText: { color: '#fff', fontSize: ms(15), fontWeight: '600' },
});
