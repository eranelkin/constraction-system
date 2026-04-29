import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiRequest } from '../../lib/api-client';
import { getAccessToken } from '../../lib/auth/token-storage';
import type { ListConversationsResponse, ConversationSummary, StartConversationResponse } from '@constractor/types';

export default function ConversationListScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [newParticipantId, setNewParticipantId] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const data = await apiRequest<ListConversationsResponse>('/messaging/conversations', {
        token: token ?? undefined,
      });
      setConversations(data.conversations);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  }

  async function handleStart() {
    const participantId = newParticipantId.trim();
    if (!participantId) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      const data = await apiRequest<StartConversationResponse>('/messaging/conversations', {
        method: 'POST',
        body: { participantId },
        token: token ?? undefined,
      });
      setNewParticipantId('');
      await loadConversations();
      router.push(`/(messages)/${data.conversation.id}`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start conversation');
    } finally {
      setLoading(false);
    }
  }

  function renderItem({ item }: { item: ConversationSummary }) {
    const others = item.participants.filter((_, i) => i > 0);
    const label = others.length > 0 ? others.map(p => p.displayName).join(', ') : 'Conversation';
    return (
      <TouchableOpacity
        style={styles.convItem}
        onPress={() => router.push(`/(messages)/${item.id}`)}
      >
        <Text style={styles.convName}>{label}</Text>
        {item.lastMessage && (
          <Text style={styles.convPreview} numberOfLines={1}>{item.lastMessage.body}</Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.newConvRow}>
        <TextInput
          style={styles.input}
          value={newParticipantId}
          onChangeText={setNewParticipantId}
          placeholder="Paste user ID to message…"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.startBtn, loading && styles.startBtnDisabled]}
          onPress={() => void handleStart()}
          disabled={loading}
        >
          <Text style={styles.startBtnText}>{loading ? '…' : 'Start'}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={() => void handleRefresh()}
        ListEmptyComponent={<Text style={styles.empty}>No conversations yet</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  newConvRow: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff' },
  input: { flex: 1, padding: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, fontSize: 13 },
  startBtn: { backgroundColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: '#fff', fontWeight: '600' },
  convItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff' },
  convName: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  convPreview: { fontSize: 13, color: '#64748b', marginTop: 4 },
  empty: { padding: 24, textAlign: 'center', color: '#94a3b8' },
});
