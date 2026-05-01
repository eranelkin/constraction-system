import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { apiRequest } from '@/lib/api-client';
import { saveSession } from '@/lib/auth/token-storage';
import type { AuthResponseDTO } from '@constractor/types';

export default function RegisterScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'manager' | 'member'>('member');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!email || !password || !displayName) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const result = await apiRequest<AuthResponseDTO>('/auth/register', {
        method: 'POST',
        body: { email, password, displayName, role },
      });
      await saveSession(result.user, result.tokens);
      router.replace('/(home)' as never);
    } catch (err) {
      Alert.alert('Registration failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <TextInput
        style={styles.input}
        placeholder="Full name"
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      <Text style={styles.label}>I am a:</Text>
      <View style={styles.roleRow}>
        <Pressable
          style={[styles.roleBtn, role === 'member' && styles.roleBtnActive]}
          onPress={() => setRole('member')}
        >
          <Text style={[styles.roleBtnText, role === 'member' && styles.roleBtnTextActive]}>
            Worker
          </Text>
        </Pressable>
        <Pressable
          style={[styles.roleBtn, role === 'manager' && styles.roleBtnActive]}
          onPress={() => setRole('manager')}
        >
          <Text style={[styles.roleBtnText, role === 'manager' && styles.roleBtnTextActive]}>
            Manager
          </Text>
        </Pressable>
      </View>
      <Pressable style={styles.button} onPress={handleRegister} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
      </Pressable>
      <Text style={styles.link}>
        Already have an account?{' '}
        <Text style={styles.linkText} onPress={() => router.back()}>
          Login
        </Text>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#444' },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  roleBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  roleBtnActive: { backgroundColor: '#0070f3', borderColor: '#0070f3' },
  roleBtnText: { fontSize: 16, fontWeight: '600', color: '#333' },
  roleBtnTextActive: { color: '#fff' },
  button: { backgroundColor: '#0070f3', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#666' },
  linkText: { color: '#0070f3', fontWeight: '600' },
});
