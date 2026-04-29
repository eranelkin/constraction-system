import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { apiRequest } from '../../lib/api-client';
import { getAccessToken, getStoredUser } from '../../lib/auth/token-storage';
import type { ListMessagesResponse, SendMessageResponse, Message } from '@constractor/types';

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const lastIdRef = useRef<string | undefined>(undefined);
  const flatListRef = useRef<FlatList<Message>>(null);

  const fetchToken = useCallback(async () => {
    return (await getAccessToken()) ?? undefined;
  }, []);

  useEffect(() => {
    void (async () => {
      const user = await getStoredUser();
      setUserId(user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        const token = await fetchToken();
        const data = await apiRequest<ListMessagesResponse>(
          `/messaging/conversations/${id}/messages`,
          { token },
        );
        setMessages(data.messages);
        lastIdRef.current = data.messages.at(-1)?.id;
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load messages');
      }
    };

    void load();

    const interval = setInterval(async () => {
      const after = lastIdRef.current;
      const url = after
        ? `/messaging/conversations/${id}/messages?after=${after}`
        : `/messaging/conversations/${id}/messages`;
      try {
        const token = await fetchToken();
        const data = await apiRequest<ListMessagesResponse>(url, { token });
        if (data.messages.length > 0) {
          setMessages((prev) => [...prev, ...data.messages]);
          lastIdRef.current = data.messages.at(-1)?.id;
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id, fetchToken]);

  async function handleSend() {
    const body = input.trim();
    if (!body || !id) return;
    setInput('');
    try {
      const token = await fetchToken();
      const data = await apiRequest<SendMessageResponse>(
        `/messaging/conversations/${id}/messages`,
        { method: 'POST', body: { body }, token },
      );
      setMessages((prev) => [...prev, data.message]);
      lastIdRef.current = data.message.id;
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to send');
    }
  }

  function renderItem({ item }: { item: Message }) {
    const isMe = item.senderId === userId;
    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
        <Text style={isMe ? styles.bubbleMeText : styles.bubbleThemText}>{item.body}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hi!</Text>}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message…"
          multiline
          returnKeyType="send"
          onSubmitEditing={() => void handleSend()}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
          onPress={() => void handleSend()}
          disabled={!input.trim()}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  messageList: { padding: 12, gap: 8 },
  bubble: { maxWidth: '75%', padding: 10, borderRadius: 12, marginVertical: 2 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#3b82f6' },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  bubbleMeText: { color: '#fff', fontSize: 15 },
  bubbleThemText: { color: '#1e293b', fontSize: 15 },
  senderName: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 3 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
  inputRow: { flexDirection: 'row', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  input: { flex: 1, padding: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, maxHeight: 100, fontSize: 15 },
  sendBtn: { backgroundColor: '#3b82f6', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontWeight: '600' },
});
