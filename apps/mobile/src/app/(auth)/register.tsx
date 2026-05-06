import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/lib/api-client';
import { saveSession } from '@/lib/auth/token-storage';
import { ms } from '@/lib/responsive';
import type { AuthResponseDTO } from '@constractor/types';

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'manager' | 'member'>('member');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!email || !password || !displayName) {
      Alert.alert(t('common.error'), t('auth.register.validationError'));
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
      Alert.alert(t('auth.register.errorTitle'), err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.register.title')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('auth.register.namePlaceholder')}
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.register.emailPlaceholder')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.register.passwordPlaceholder')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <Text style={styles.label}>{t('auth.register.roleLabel')}</Text>
        <View style={styles.roleRow}>
          <Pressable
            style={[styles.roleBtn, role === 'member' && styles.roleBtnActive]}
            onPress={() => setRole('member')}
          >
            <Text style={[styles.roleBtnText, role === 'member' && styles.roleBtnTextActive]}>
              {t('auth.register.roleWorker')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.roleBtn, role === 'manager' && styles.roleBtnActive]}
            onPress={() => setRole('manager')}
          >
            <Text style={[styles.roleBtnText, role === 'manager' && styles.roleBtnTextActive]}>
              {t('auth.register.roleManager')}
            </Text>
          </Pressable>
        </View>
        <Pressable style={styles.button} onPress={() => void handleRegister()} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? t('auth.register.submitting') : t('auth.register.submit')}</Text>
        </Pressable>
        <Text style={styles.link}>
          {t('auth.register.alreadyHaveAccount')}{' '}
          <Text style={styles.linkText} onPress={() => router.back()}>
            {t('auth.register.loginLink')}
          </Text>
        </Text>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: ms(24), justifyContent: 'center' },
  title: { fontSize: ms(26), fontWeight: '700', marginBottom: ms(20) },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: ms(8), padding: ms(13), marginBottom: ms(14), fontSize: ms(15) },
  label: { fontSize: ms(14), fontWeight: '600', marginBottom: ms(8), color: '#444' },
  roleRow: { flexDirection: 'row', gap: ms(12), marginBottom: ms(20) },
  roleBtn: { flex: 1, padding: ms(13), borderRadius: ms(8), borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  roleBtnActive: { backgroundColor: '#0070f3', borderColor: '#0070f3' },
  roleBtnText: { fontSize: ms(15), fontWeight: '600', color: '#333' },
  roleBtnTextActive: { color: '#fff' },
  button: { backgroundColor: '#0070f3', padding: ms(14), borderRadius: ms(8), alignItems: 'center', marginBottom: ms(14) },
  buttonText: { color: '#fff', fontSize: ms(15), fontWeight: '600' },
  link: { textAlign: 'center', color: '#666', fontSize: ms(14) },
  linkText: { color: '#0070f3', fontWeight: '600' },
});
