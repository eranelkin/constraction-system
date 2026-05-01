import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  StatusBar,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { getAccessToken, getStoredUser, clearSession } from '@/lib/auth/token-storage';
import { apiRequest } from '@/lib/api-client';
import type { AuthUser } from '@constractor/types';
import type { ContactUser } from '@constractor/types';

const EMOJIS = ['🐻', '🦊', '🐯', '🦁', '🐸', '🦄', '🐙', '🦋', '🐺', '🦅', '🦉', '🐨'];
const COLORS = ['#FF6B2B', '#FFD93D', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD', '#FF9FF3', '#54A0FF'];
const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4501';

function UserAvatar({ userId, fallbackEmoji, fallbackColor, size }: {
  userId: string; fallbackEmoji: string; fallbackColor: string; size: number;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 2.5, borderColor: '#1C1C2E', backgroundColor: fallbackColor,
      overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    }}>
      {!failed ? (
        <Image
          source={{ uri: `${API_URL}/users/${userId}/avatar` }}
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={{ fontSize: size * 0.5 }}>{fallbackEmoji}</Text>
      )}
    </View>
  );
}

type Tab = 'msg' | 'tasks';

export default function HomeScreen() {
  const [tab, setTab] = useState<Tab>('msg');
  const [users, setUsers] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);

  useEffect(() => {
    void getStoredUser().then(setMe);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const data = await apiRequest<{ users: ContactUser[] }>('/auth/users', {
        token: token ?? undefined,
      });
      setUsers(data.users);
    } catch {
      Alert.alert('Error', 'Could not load team members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'msg') void loadUsers();
  }, [tab, loadUsers]);

  function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: () => {
          void clearSession().then(() => router.replace('/(auth)/login' as never));
        },
      },
    ]);
  }

  async function openChat(user: ContactUser, index: number) {
    setStarting(user.id);
    try {
      const token = await getAccessToken();
      const data = await apiRequest<{ conversation: { id: string } }>(
        '/messaging/conversations',
        { method: 'POST', body: { participantId: user.id }, token: token ?? undefined },
      );
      router.push({
        pathname: '/(messages)/[id]',
        params: {
          id: data.conversation.id,
          userName: user.displayName,
          userId: user.id,
          avatarEmoji: EMOJIS[index % EMOJIS.length],
          avatarColor: COLORS[index % COLORS.length],
        },
      } as never);
    } catch {
      Alert.alert('Error', 'Could not open chat');
    } finally {
      setStarting(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#FF6B2B" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏗️ Constractor</Text>
        <View style={styles.headerRight}>
          {me && (
            <UserAvatar
              userId={me.id}
              fallbackEmoji={EMOJIS[me.id.charCodeAt(0) % EMOJIS.length] ?? '😊'}
              fallbackColor={COLORS[me.id.charCodeAt(0) % COLORS.length] ?? '#FF6B2B'}
              size={38}
            />
          )}
          <Pressable
            style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}
            onPress={handleLogout}
          >
            <Text style={styles.logoutBtnText}>⏻</Text>
          </Pressable>
        </View>
      </View>

      {/* Tab pills */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, tab === 'msg' && styles.tabActive]}
          onPress={() => setTab('msg')}
        >
          <Text style={[styles.tabText, tab === 'msg' && styles.tabTextActive]}>💬 Msg</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'tasks' && styles.tabActive]}
          onPress={() => setTab('tasks')}
        >
          <Text style={[styles.tabText, tab === 'tasks' && styles.tabTextActive]}>✅ Tasks</Text>
        </Pressable>
      </View>

      {/* Content */}
      {tab === 'msg' ? (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#FF6B2B" />
            <Text style={styles.loadingText}>Loading team…</Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const emoji = EMOJIS[index % EMOJIS.length] ?? '😊';
              const color = COLORS[index % COLORS.length] ?? '#FF6B2B';
              const isLoading = starting === item.id;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.card,
                    (pressed || isLoading) && styles.cardPressed,
                  ]}
                  onPress={() => void openChat(item, index)}
                  disabled={isLoading}
                >
                  <UserAvatar userId={item.id} fallbackEmoji={emoji} fallbackColor={color} size={60} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.displayName}</Text>
                    <Text style={styles.userRole}>
                      {item.role === 'manager' ? '👔 Manager' : item.role === 'admin' ? '⭐ Admin' : '👷 Worker'}
                    </Text>
                  </View>
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FF6B2B" />
                  ) : (
                    <Text style={styles.chevron}>›</Text>
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>👥</Text>
                <Text style={styles.emptyTitle}>No teammates yet</Text>
                <Text style={styles.emptySubtitle}>Your team will appear here</Text>
              </View>
            }
          />
        )
      ) : (
        <View style={styles.comingSoon}>
          <View style={styles.comingSoonCard}>
            <Text style={styles.comingSoonEmoji}>🚧</Text>
            <Text style={styles.comingSoonTitle}>Tasks</Text>
            <Text style={styles.comingSoonSub}>Coming soon!</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFF9E6',
  },
  header: {
    backgroundColor: '#FF6B2B',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 2.5,
    borderBottomColor: '#1C1C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  logoutBtnText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  tabRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 5,
  },
  tabActive: {
    backgroundColor: '#FF6B2B',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C2E',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C2E',
  },
  list: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    padding: 14,
    gap: 14,
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  cardPressed: {
    shadowOffset: { width: 1, height: 1 },
    transform: [{ translateX: 3 }, { translateY: 3 }],
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 32,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1C1C2E',
  },
  userRole: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginTop: 3,
  },
  chevron: {
    fontSize: 30,
    fontWeight: '900',
    color: '#1C1C2E',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 64,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C2E',
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  comingSoon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  comingSoonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    padding: 40,
    alignItems: 'center',
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
    gap: 12,
  },
  comingSoonEmoji: {
    fontSize: 72,
  },
  comingSoonTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#1C1C2E',
  },
  comingSoonSub: {
    fontSize: 17,
    fontWeight: '600',
    color: '#888',
  },
});
