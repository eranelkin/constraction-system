import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Home' }} />
        <Stack.Screen name="(auth)/login" options={{ title: 'Login' }} />
        <Stack.Screen name="(auth)/register" options={{ title: 'Create Account' }} />
        <Stack.Screen name="(messages)" options={{ headerShown: false }} />
        <Stack.Screen name="(jobs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
