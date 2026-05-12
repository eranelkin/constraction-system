import '@/lib/i18n';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, I18nManager, DevSettings } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot, useRouter } from 'expo-router';
import i18n from 'i18next';
import * as SecureStore from 'expo-secure-store';
import { getAccessToken, getStoredUser } from '@/lib/auth/token-storage';

const RTL_RELOAD_KEY = 'rtl_reload_pending';

export default function RootLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [token, user] = await Promise.all([getAccessToken(), getStoredUser()]);

        if (user?.language) {
          await i18n.changeLanguage(user.language);

          const shouldBeRTL = user.language === 'he';
          if (I18nManager.isRTL !== shouldBeRTL) {
            I18nManager.allowRTL(shouldBeRTL);
            I18nManager.forceRTL(shouldBeRTL);
            if (__DEV__) {
              const pending = await SecureStore.getItemAsync(RTL_RELOAD_KEY);
              if (!pending) {
                await SecureStore.setItemAsync(RTL_RELOAD_KEY, '1');
                DevSettings.reload();
                return;
              }
              await SecureStore.deleteItemAsync(RTL_RELOAD_KEY);
            }
          }
        }

        if (token && user) router.replace('/(home)');
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <Slot />
        {checking && (
          <View style={styles.splash}>
            <Text style={styles.splashEmoji}>🏗️</Text>
          </View>
        )}
      </View>
    </SafeAreaProvider>
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
  splashEmoji: {
    fontSize: 80,
  },
});
