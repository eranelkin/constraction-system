import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

export default function HomeScreen() {
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
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 32 },
  nav: { gap: 12, width: '100%' },
  button: { backgroundColor: '#0070f3', padding: 16, borderRadius: 8, alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#333' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
