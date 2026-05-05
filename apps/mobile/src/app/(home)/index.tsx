import { useEffect, useState, useCallback, useRef } from "react";
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
  Modal,
  TouchableOpacity,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  getAccessToken,
  getStoredUser,
  clearSession,
} from "@/lib/auth/token-storage";
import { apiRequest } from "@/lib/api-client";
import { ms, s, vs } from "@/lib/responsive";
import { connectSocket, getSocket } from "@/lib/socket";
import type {
  AuthUser,
  ContactUser,
  PublicGroup,
  ConversationSummary,
} from "@constractor/types";

const EMOJIS = [
  "🐻",
  "🦊",
  "🐯",
  "🦁",
  "🐸",
  "🦄",
  "🐙",
  "🦋",
  "🐺",
  "🦅",
  "🦉",
  "🐨",
];
const COLORS = [
  "#FF6B2B",
  "#FFD93D",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#DDA0DD",
  "#FF9FF3",
  "#54A0FF",
];
const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4501";

const AVATAR_SIZE = s(52);
const HEADER_AVATAR_SIZE = s(34);

function UserAvatar({
  userId,
  fallbackEmoji,
  fallbackColor,
  size,
}: {
  userId: string;
  fallbackEmoji: string;
  fallbackColor: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2.5,
        borderColor: "#1C1C2E",
        backgroundColor: fallbackColor,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
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

function GroupAvatar({
  emoji,
  color,
  size,
}: {
  emoji: string;
  color: string;
  size: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2.5,
        borderColor: "#1C1C2E",
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
    </View>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : String(count)}</Text>
    </View>
  );
}

type Tab = "msg" | "tasks";

type ListItem =
  | { kind: "header"; title: string }
  | { kind: "contact"; user: ContactUser; index: number }
  | { kind: "group"; group: PublicGroup };

export default function HomeScreen() {
  const [tab, setTab] = useState<Tab>("msg");
  const [fabOpen, setFabOpen] = useState(false);
  const [users, setUsers] = useState<ContactUser[]>([]);
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [contactUnread, setContactUnread] = useState<Map<string, number>>(
    new Map(),
  );
  const [groupUnread, setGroupUnread] = useState<Map<string, number>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const meRef = useRef<AuthUser | null>(null);

  useEffect(() => {
    void (async () => {
      const u = await getStoredUser();
      setMe(u);
      meRef.current = u;

      // Refresh user object from server to get latest permissions
      try {
        const token = await getAccessToken();
        const fresh = await apiRequest<{ user: AuthUser }>('/auth/me', { token: token ?? undefined });
        setMe(fresh.user);
        meRef.current = fresh.user;
      } catch { /* use cached user */ }
    })();
  }, []);

  const loadData = useCallback(async (myId?: string, silent = false) => {
    const resolvedMyId =
      myId ?? meRef.current?.id ?? (await getStoredUser())?.id;
    if (!silent) setLoading(true);
    try {
      const token = await getAccessToken();
      const t = token ?? undefined;
      const [usersData, groupsData, convsData] = await Promise.all([
        apiRequest<{ users: ContactUser[] }>("/auth/users", { token: t }),
        apiRequest<{ groups: PublicGroup[] }>("/groups/mine", { token: t }),
        apiRequest<{ conversations: ConversationSummary[] }>(
          "/messaging/conversations",
          { token: t },
        ),
      ]);
      if (!silent) {
        setUsers(usersData.users);
        setGroups(groupsData.groups);
      }

      const newContactUnread = new Map<string, number>();
      const newGroupUnread = new Map<string, number>();
      const groupConvIds = new Set(
        groupsData.groups
          .map((g) => g.conversationId)
          .filter((id): id is string => id !== null),
      );

      for (const conv of convsData.conversations) {
        if (conv.unreadCount === 0) continue;
        if (groupConvIds.has(conv.id)) {
          const group = groupsData.groups.find(
            (g) => g.conversationId === conv.id,
          );
          if (group) newGroupUnread.set(group.id, conv.unreadCount);
        } else {
          const other = conv.participants.find(
            (p) => p.userId !== resolvedMyId,
          );
          if (other) newContactUnread.set(other.userId, conv.unreadCount);
        }
      }
      setContactUnread(newContactUnread);
      setGroupUnread(newGroupUnread);
    } catch {
      if (!silent) Alert.alert("Error", "Could not load messages");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "msg") void loadData(meRef.current?.id);
  }, [tab, loadData]);

  const isFirstFocusRef = useRef(true);

  // On every focus: reload data (with delay when returning from chat so POST /read
  // completes first) and re-register the socket badge listener (handles reconnections).
  useFocusEffect(
    useCallback(() => {
      const delay = isFirstFocusRef.current ? 0 : 300;
      isFirstFocusRef.current = false;

      const timer = setTimeout(() => {
        void loadData(meRef.current?.id);
      }, delay);

      void (async () => {
        const token = await getAccessToken();
        if (!token) return;
        const sock = connectSocket(token);
        sock.on("conversation_updated", () => {
          void loadData(meRef.current?.id, true);
        });
      })();

      return () => {
        clearTimeout(timer);
        getSocket()?.off("conversation_updated");
      };
    }, [loadData]),
  );

  function handleLogout() {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          void clearSession().then(() =>
            router.replace("/(auth)/login" as never),
          );
        },
      },
    ]);
  }

  async function openChat(user: ContactUser, index: number) {
    setStarting(user.id);
    try {
      const token = await getAccessToken();
      const data = await apiRequest<{ conversation: { id: string } }>(
        "/messaging/conversations",
        {
          method: "POST",
          body: { participantId: user.id },
          token: token ?? undefined,
        },
      );
      router.push({
        pathname: "/(messages)/[id]",
        params: {
          id: data.conversation.id,
          userName: user.displayName,
          userId: user.id,
          avatarEmoji: EMOJIS[index % EMOJIS.length],
          avatarColor: COLORS[index % COLORS.length],
        },
      } as never);
    } catch {
      Alert.alert("Error", "Could not open chat");
    } finally {
      setStarting(null);
    }
  }

  function openGroup(group: PublicGroup) {
    if (!group.conversationId) {
      Alert.alert("Error", "This group has no conversation yet");
      return;
    }
    router.push({
      pathname: "/(messages)/[id]",
      params: {
        id: group.conversationId,
        userName: group.name,
        isGroup: "true",
        avatarEmoji: group.emoji ?? "🏘️",
        avatarColor: group.color ?? "#4ECDC4",
      },
    } as never);
  }

  const listData: ListItem[] = [];
  if (users.length > 0) {
    listData.push({ kind: "header", title: "💬 Direct Messages" });
    users.forEach((user, index) =>
      listData.push({ kind: "contact", user, index }),
    );
  }
  if (groups.length > 0) {
    listData.push({ kind: "header", title: "🏘️ Groups" });
    groups.forEach((group) => listData.push({ kind: "group", group }));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#FF6B2B" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          🏗️ Constractor
        </Text>
        <View style={styles.headerRight}>
          {me && (
            <UserAvatar
              userId={me.id}
              fallbackEmoji={
                EMOJIS[me.id.charCodeAt(0) % EMOJIS.length] ?? "😊"
              }
              fallbackColor={
                COLORS[me.id.charCodeAt(0) % COLORS.length] ?? "#FF6B2B"
              }
              size={HEADER_AVATAR_SIZE}
            />
          )}
          <Pressable
            style={({ pressed }) => [
              styles.logoutBtn,
              pressed && styles.logoutBtnPressed,
            ]}
            onPress={handleLogout}
          >
            <Text style={styles.logoutBtnText}>⏻</Text>
          </Pressable>
        </View>
      </View>

      {/* Tab pills */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, tab === "msg" && styles.tabActive]}
          onPress={() => setTab("msg")}
        >
          <Text style={[styles.tabText, tab === "msg" && styles.tabTextActive]}>
            💬 Chats
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "tasks" && styles.tabActive]}
          onPress={() => setTab("tasks")}
        >
          <Text
            style={[styles.tabText, tab === "tasks" && styles.tabTextActive]}
          >
            ✅ Tasks
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {tab === "msg" ? (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#FF6B2B" />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item) => {
              if (item.kind === "header") return `header-${item.title}`;
              if (item.kind === "contact") return `contact-${item.user.id}`;
              return `group-${item.group.id}`;
            }}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              if (item.kind === "header") {
                return <Text style={styles.sectionHeader}>{item.title}</Text>;
              }
              if (item.kind === "contact") {
                const emoji = EMOJIS[item.index % EMOJIS.length] ?? "😊";
                const color = COLORS[item.index % COLORS.length] ?? "#FF6B2B";
                const isLoading = starting === item.user.id;
                const unread = contactUnread.get(item.user.id) ?? 0;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.card,
                      (pressed || isLoading) && styles.cardPressed,
                    ]}
                    onPress={() => void openChat(item.user, item.index)}
                    disabled={isLoading}
                  >
                    <UserAvatar
                      userId={item.user.id}
                      fallbackEmoji={emoji}
                      fallbackColor={color}
                      size={AVATAR_SIZE}
                    />
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardName} numberOfLines={1}>
                        {item.user.displayName}
                      </Text>
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {item.user.role === "manager"
                          ? "👔 Manager"
                          : item.user.role === "admin"
                            ? "⭐ Admin"
                            : "👷 Worker"}
                      </Text>
                    </View>
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#FF6B2B" />
                    ) : (
                      <View style={styles.cardRight}>
                        <UnreadBadge count={unread} />
                        <Text style={styles.chevron}>›</Text>
                      </View>
                    )}
                  </Pressable>
                );
              }
              const g = item.group;
              const isLoading = starting === g.id;
              const unread = groupUnread.get(g.id) ?? 0;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.card,
                    (pressed || isLoading) && styles.cardPressed,
                  ]}
                  onPress={() => openGroup(g)}
                  disabled={isLoading}
                >
                  <GroupAvatar
                    emoji={g.emoji ?? "🏘️"}
                    color={g.color ?? "#4ECDC4"}
                    size={AVATAR_SIZE}
                  />
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      👥 {g.memberCount} member{g.memberCount !== 1 ? "s" : ""}
                    </Text>
                    {g.description ? (
                      <Text style={styles.cardDesc} numberOfLines={1}>
                        {g.description}
                      </Text>
                    ) : null}
                  </View>
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FF6B2B" />
                  ) : (
                    <View style={styles.cardRight}>
                      <UnreadBadge count={unread} />
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>👥</Text>
                <Text style={styles.emptyTitle}>No teammates yet</Text>
                <Text style={styles.emptySubtitle}>
                  Your team will appear here
                </Text>
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
      {/* FAB */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setFabOpen(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* Action sheet */}
      <Modal
        visible={fabOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFabOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setFabOpen(false)}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Pressable
            style={styles.sheetItem}
            onPress={() => {
              setFabOpen(false);
              router.push('/report-new' as never);
            }}
          >
            <Text style={styles.sheetItemEmoji}>📋</Text>
            <View>
              <Text style={styles.sheetItemTitle}>New Report</Text>
              <Text style={styles.sheetItemSub}>Field progress, issue, delay or safety</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.sheetItem, styles.sheetItemDisabled]}
            onPress={() => {
              setFabOpen(false);
              Alert.alert('Coming soon', 'Task creation is coming in a future update.');
            }}
          >
            <Text style={styles.sheetItemEmoji}>✅</Text>
            <View>
              <Text style={[styles.sheetItemTitle, { color: '#aaa' }]}>New Task</Text>
              <Text style={styles.sheetItemSub}>Coming soon</Text>
            </View>
          </Pressable>
          <Pressable
            style={styles.sheetCancel}
            onPress={() => setFabOpen(false)}
          >
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFF9E6",
  },
  header: {
    backgroundColor: "#FF6B2B",
    paddingHorizontal: ms(16),
    paddingVertical: ms(12),
    borderBottomWidth: 2.5,
    borderBottomColor: "#1C1C2E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: ms(22),
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    flexShrink: 0,
  },
  logoutBtn: {
    width: s(34),
    height: s(34),
    borderRadius: s(17),
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  logoutBtnText: {
    fontSize: ms(15),
    color: "#FFFFFF",
  },
  tabRow: {
    flexDirection: "row",
    padding: ms(12),
    gap: ms(10),
  },
  tab: {
    flex: 1,
    paddingVertical: ms(11),
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: "#1C1C2E",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: "#1C1C2E",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 5,
  },
  tabActive: {
    backgroundColor: "#FF6B2B",
  },
  tabText: {
    fontSize: ms(15),
    fontWeight: "800",
    color: "#1C1C2E",
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: ms(12),
  },
  loadingText: {
    fontSize: ms(15),
    fontWeight: "700",
    color: "#1C1C2E",
  },
  list: {
    padding: ms(12),
    gap: ms(8),
    paddingBottom: ms(24),
  },
  sectionHeader: {
    fontSize: ms(12),
    fontWeight: "800",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: ms(4),
    marginBottom: ms(2),
    paddingHorizontal: ms(4),
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: ms(16),
    borderWidth: 2.5,
    borderColor: "#1C1C2E",
    padding: ms(12),
    gap: ms(12),
    shadowColor: "#1C1C2E",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 5,
  },
  cardPressed: {
    shadowOffset: { width: 1, height: 1 },
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  cardInfo: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: ms(16),
    fontWeight: "800",
    color: "#1C1C2E",
  },
  cardSub: {
    fontSize: ms(12),
    fontWeight: "600",
    color: "#666",
    marginTop: ms(2),
  },
  cardDesc: {
    fontSize: ms(11),
    fontWeight: "500",
    color: "#999",
    marginTop: ms(2),
  },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(5),
    flexShrink: 0,
  },
  badge: {
    backgroundColor: "#2ECC71",
    borderRadius: 999,
    minWidth: ms(20),
    height: ms(20),
    paddingHorizontal: ms(4),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1C1C2E",
  },
  badgeText: {
    fontSize: ms(10),
    fontWeight: "900",
    color: "#FFFFFF",
  },
  chevron: {
    fontSize: ms(24),
    fontWeight: "900",
    color: "#1C1C2E",
    lineHeight: ms(28),
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: vs(60),
    gap: ms(8),
  },
  emptyEmoji: {
    fontSize: ms(52),
  },
  emptyTitle: {
    fontSize: ms(18),
    fontWeight: "800",
    color: "#1C1C2E",
  },
  emptySubtitle: {
    fontSize: ms(13),
    fontWeight: "500",
    color: "#888",
  },
  comingSoon: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: ms(20),
  },
  comingSoonCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: ms(20),
    borderWidth: 2.5,
    borderColor: "#1C1C2E",
    padding: ms(28),
    alignItems: "center",
    width: "100%",
    shadowColor: "#1C1C2E",
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
    gap: ms(10),
  },
  comingSoonEmoji: {
    fontSize: ms(52),
  },
  comingSoonTitle: {
    fontSize: ms(28),
    fontWeight: "900",
    color: "#1C1C2E",
  },
  comingSoonSub: {
    fontSize: ms(15),
    fontWeight: "600",
    color: "#888",
  },
  fab: {
    position: "absolute",
    bottom: ms(28),
    right: ms(20),
    width: s(56),
    height: s(56),
    borderRadius: s(28),
    backgroundColor: "#FF6B2B",
    borderWidth: 2.5,
    borderColor: "#1C1C2E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C2E",
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
  },
  fabPressed: {
    shadowOffset: { width: 2, height: 2 },
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  fabText: {
    fontSize: ms(28),
    fontWeight: "900",
    color: "#FFFFFF",
    lineHeight: ms(32),
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#FFF9E6",
    borderTopLeftRadius: ms(20),
    borderTopRightRadius: ms(20),
    borderWidth: 2.5,
    borderBottomWidth: 0,
    borderColor: "#1C1C2E",
    paddingBottom: vs(24),
    paddingHorizontal: ms(16),
    paddingTop: ms(12),
  },
  sheetHandle: {
    width: ms(40),
    height: ms(5),
    borderRadius: 99,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: ms(16),
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(14),
    paddingVertical: ms(14),
    paddingHorizontal: ms(8),
    borderRadius: ms(12),
    borderWidth: 2.5,
    borderColor: "#1C1C2E",
    backgroundColor: "#FFFFFF",
    marginBottom: ms(10),
    shadowColor: "#1C1C2E",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 5,
  },
  sheetItemDisabled: {
    backgroundColor: "#F5F5F5",
    shadowOpacity: 0.3,
  },
  sheetItemEmoji: {
    fontSize: ms(28),
  },
  sheetItemTitle: {
    fontSize: ms(16),
    fontWeight: "800",
    color: "#1C1C2E",
  },
  sheetItemSub: {
    fontSize: ms(12),
    fontWeight: "500",
    color: "#888",
    marginTop: ms(2),
  },
  sheetCancel: {
    paddingVertical: ms(14),
    alignItems: "center",
    borderRadius: ms(12),
    borderWidth: 2.5,
    borderColor: "#1C1C2E",
    backgroundColor: "#FFFFFF",
    marginTop: ms(4),
  },
  sheetCancelText: {
    fontSize: ms(16),
    fontWeight: "800",
    color: "#1C1C2E",
  },
});
