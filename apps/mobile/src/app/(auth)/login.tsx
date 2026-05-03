import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { apiRequest } from "@/lib/api-client";
import { saveSession } from "@/lib/auth/token-storage";
import { ms } from "@/lib/responsive";
import type { AuthResponseDTO } from "@constractor/types";

const DEV_USERS = [
  { label: "👷 Hebrew", email: "member1@test.com", password: "Test1234!" },
  { label: "👷 English", email: "member2@test.com", password: "Test1234!" },
  { label: "👔 Manager 1", email: "manager1@test.com", password: "Test1234!" },
] as const;

async function clearMessages() {
  try {
    await apiRequest("/dev/clear-messages", { method: "POST" });
    Alert.alert("Done", "All messages cleared.");
  } catch (err) {
    Alert.alert(
      "Error",
      err instanceof Error ? err.message : "Failed to clear messages",
    );
  }
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function performLogin(loginEmail: string, loginPassword: string) {
    if (!loginEmail || !loginPassword) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const result = await apiRequest<AuthResponseDTO>("/auth/login", {
        method: "POST",
        body: { email: loginEmail, password: loginPassword },
      });
      await saveSession(result.user, result.tokens);
      router.replace("/(home)" as never);
    } catch (err) {
      Alert.alert(
        "Login failed",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Login</Text>
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
          autoComplete="current-password"
        />
        <Pressable
          style={styles.button}
          onPress={() => void performLogin(email, password)}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Logging in…" : "Login"}
          </Text>
        </Pressable>
        <Text style={styles.link}>
          No account?{" "}
          <Text
            style={styles.linkText}
            onPress={() => router.push("/(auth)/register" as never)}
          >
            Register
          </Text>
        </Text>

        {__DEV__ && (
          <View style={styles.devPanel}>
            <Text style={styles.devLabel}>DEV QUICK LOGIN</Text>
            {DEV_USERS.map((u) => (
              <Pressable
                key={u.email}
                style={[styles.button, styles.devButton]}
                onPress={() => void performLogin(u.email, u.password)}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{u.label}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.button, styles.devDestroyButton]}
              onPress={() => void clearMessages()}
            >
              <Text style={styles.buttonText}>🗑️ Clear All Messages</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: ms(24), justifyContent: "center" },
  title: { fontSize: ms(26), fontWeight: "700", marginBottom: ms(20) },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: ms(8),
    padding: ms(13),
    marginBottom: ms(14),
    fontSize: ms(15),
  },
  button: {
    backgroundColor: "#0070f3",
    padding: ms(14),
    borderRadius: ms(8),
    alignItems: "center",
    marginBottom: ms(14),
  },
  buttonText: { color: "#fff", fontSize: ms(15), fontWeight: "600" },
  link: { textAlign: "center", color: "#666", fontSize: ms(14) },
  linkText: { color: "#0070f3", fontWeight: "600" },
  devPanel: {
    marginTop: ms(28),
    paddingTop: ms(18),
    borderTopWidth: 2,
    borderTopColor: "#FFD93D",
    gap: ms(10),
  },
  devLabel: {
    fontSize: ms(11),
    fontWeight: "800",
    color: "#888",
    textAlign: "center",
    letterSpacing: 1.5,
    marginBottom: ms(4),
  },
  devButton: { backgroundColor: "#1C1C2E" },
  devDestroyButton: { backgroundColor: "#7B0000", marginTop: ms(6) },
});
