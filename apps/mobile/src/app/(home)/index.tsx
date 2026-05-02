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
import type { ContactUser, PublicGroup } from '@constractor/types';

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

function GroupAvatar({ emoji, color, size }: { emoji: string; color: string; size: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 2.5, borderColor: '#1C1C2E', backgroundColor: color,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
    </View>
  );
}

type Tab = 'msg' | 'tasks';

type ListItem =
  | { kind: 'header'; title: string }
  | { kind: 'contact'; user: ContactUser; index: number }
  | { kind: 'group'; group: PublicGroup };

export default function HomeScreen() {
  const [tab, setTab] = useState<Tab>('msg');
  const [users, setUsers] = useState<ContactUser[]>([]);
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);

  useEffect(() => {
    void getStoredUser().then(setMe);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const [usersData, groupsData] = await Promise.all([
        apiRequest<{ users: ContactUser[] }>('/auth/users', { token: token ?? undefined }),
        apiRequest<{ groups: PublicGroup[] }>('/groups/mine', { token: token ?? undefined }),
      ]);
      setUsers(usersData.users);
      setGroups(groupsData.groups);
    } catch {
      Alert.alert('Error', 'Could not load messages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'msg') void loadData();
  }, [tab, loadData]);

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

  function openGroup(group: PublicGroup) {
    if (!group.conversationId) {
      Alert.alert('Error', 'This group has no conversation yet');
      return;
    }
    setStarting(group.id);
    router.push({
      pathname: '/(messages)/[id]',
      params: {
        id: group.conversationId,
        userName: group.name,
        isGroup: 'true',
        avatarEmoji: group.emoji ?? '🏘️',
        avatarColor: group.color ?? '#4ECDC4',
      },
    } as never);
    setStarting(null);
  }

  const listData: ListItem[] = [];
  if (users.length > 0) {
    listData.push({ kind: 'header', title: '💬 Direct Messages' });
    users.forEach((user, index) => listData.push({ kind: 'contact', user, index }));
  }
  if (groups.length > 0) {
    listData.push({ kind: 'header', title: '🏘️ Groups' });
    groups.forEach((group) => listData.push({ kind: 'group', group }));
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
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item) => {
              if (item.kind === 'header') return `header-${item.title}`;
              if (item.kind === 'contact') return `contact-${item.user.id}`;
              return `group-${item.group.id}`;
            }}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              if (item.kind === 'header') {
                return <Text style={styles.sectionHeader}>{item.title}</Text>;
              }
              if (item.kind === 'contact') {
                const emoji = EMOJIS[item.index % EMOJIS.length] ?? '😊';
                const color = COLORS[item.index % COLORS.length] ?? '#FF6B2B';
                const isLoading = starting === item.user.id;
                return (
                  <Pressable
                    style={({ pressed }) => [styles.card, (pressed || isLoading) && styles.cardPressed]}
                    onPress={() => void openChat(item.user, item.index)}
                    disabled={isLoading}
                  >
                    <UserAvatar userId={item.user.id} fallbackEmoji={emoji} fallbackColor={color} size={60} />
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardName}>{item.user.displayName}</Text>
                      <Text style={styles.cardSub}>
                        {item.user.role === 'manager' ? '👔 Manager' : item.user.role === 'admin' ? '⭐ Admin' : '👷 Worker'}
                      </Text>
                    </View>
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#FF6B2B" />
                    ) : (
                      <Text style={styles.chevron}>›</Text>
                    )}
                  </Pressable>
                );
              }
              // group item
              const g = item.group;
              const isLoading = starting === g.id;
              return (
                <Pressable
                  style={({ pressed }) => [styles.card, (pressed || isLoading) && styles.cardPressed]}
                  onPress={() => openGroup(g)}
                  disabled={isLoading}
                >
                  <GroupAvatar emoji={g.emoji ?? '🏘️'} color={g.color ?? '#4ECDC4'} size={60} />
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{g.name}</Text>
                    <Text style={styles.cardSub}>👥 {g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</Text>
                    {g.description ? <Text style={styles.cardDesc} numberOfLines={1}>{g.description}</Text> : null}
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
    gap: 10,
    paddingBottom: 32,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
    marginBottom: 2,
    paddingHorizontal: 4,
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
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1C1C2E',
  },
  cardSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginTop: 3,
  },
  cardDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
    marginTop: 2,
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
