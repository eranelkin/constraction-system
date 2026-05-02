import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  SafeAreaView,
  StatusBar,
  Modal,
  ActivityIndicator,
  Image,
} from 'react-native';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4501';
const SENDER_COLORS = ['#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD', '#FF9FF3', '#54A0FF', '#FFD93D', '#FF6B2B'];

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
import { useLocalSearchParams, router } from 'expo-router';
import { Audio } from 'expo-av';
import { apiRequest } from '../../lib/api-client';
import { getAccessToken, getStoredUser } from '../../lib/auth/token-storage';
import type { ListMessagesResponse, SendMessageResponse, Message } from '@constractor/types';
import * as FileSystem from 'expo-file-system';

type VoicePhase = 'recording' | 'transcribing' | 'editing';

export default function ThreadScreen() {
  const { id, userName, userId: participantId, avatarEmoji, avatarColor, isGroup } = useLocalSearchParams<{
    id: string;
    userName?: string;
    userId?: string;
    avatarEmoji?: string;
    avatarColor?: string;
    isGroup?: string;
  }>();

  const displayName = userName ?? 'Chat';
  const emoji = avatarEmoji ?? '💬';
  const color = avatarColor ?? '#FF6B2B';
  const isGroupChat = isGroup === 'true';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [userLanguage, setUserLanguage] = useState<string>('en');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<Record<string, boolean>>({});

  // Voice state
  const [voicePhase, setVoicePhase] = useState<VoicePhase | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [recordingSecs, setRecordingSecs] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lastIdRef = useRef<string | undefined>(undefined);
  const flatListRef = useRef<FlatList<Message>>(null);
  const translatingSet = useRef<Set<string>>(new Set());

  const fetchToken = useCallback(async () => {
    return (await getAccessToken()) ?? undefined;
  }, []);

  useEffect(() => {
    void (async () => {
      const user = await getStoredUser();
      setUserId(user?.id ?? null);
      setUserLanguage((user as { language?: string } | null)?.language ?? 'en');
    })();
  }, []);

  // Message polling
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

  // ── Voice recording ──────────────────────────────────────────────────────

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission denied', 'Microphone access is needed for voice messages.');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;

      setRecordingSecs(0);
      setVoicePhase('recording');

      timerRef.current = setInterval(() => {
        setRecordingSecs((s) => s + 1);
      }, 1000);
    } catch (err) {
      Alert.alert('Error', 'Could not start recording');
      console.error(err);
    }
  }

  async function stopAndTranscribe() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recording = recordingRef.current;
    if (!recording) return;

    setVoicePhase('transcribing');

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) throw new Error('No audio URI');

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const token = await fetchToken();
      const data = await apiRequest<{ text: string }>('/speech/transcribe', {
        method: 'POST',
        body: { audio: base64, mimeType: 'audio/m4a' },
        token,
      });

      setVoiceText(data.text);
      setVoicePhase('editing');
    } catch (err) {
      Alert.alert('Error', 'Could not transcribe audio. Try again.');
      console.error(err);
      setVoicePhase(null);
    }
  }

  async function cancelVoice() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recording = recordingRef.current;
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch { /* ignore */ }
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    setVoicePhase(null);
    setVoiceText('');
    setRecordingSecs(0);
  }

  async function sendVoiceText() {
    const body = voiceText.trim();
    if (!body || !id) return;
    setVoicePhase(null);
    setVoiceText('');
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

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ── Auto-translate received messages ────────────────────────────────────

  useEffect(() => {
    if (!userId || !userLanguage) return;

    const toTranslate = messages.filter(
      (m) => m.senderId !== userId && !translatingSet.current.has(m.id),
    );
    if (!toTranslate.length) return;

    toTranslate.forEach((m) => translatingSet.current.add(m.id));

    setTranslating((prev) => {
      const next = { ...prev };
      toTranslate.forEach((m) => { next[m.id] = true; });
      return next;
    });

    void (async () => {
      const token = await fetchToken();
      await Promise.all(
        toTranslate.map(async (m) => {
          try {
            const data = await apiRequest<{ translatedText: string }>('/translate', {
              method: 'POST',
              body: { text: m.body, targetLanguage: userLanguage },
              token,
            });
            setTranslations((prev) => ({ ...prev, [m.id]: data.translatedText }));
          } catch {
            // silently fail — show original text
            translatingSet.current.delete(m.id);
          } finally {
            setTranslating((prev) => ({ ...prev, [m.id]: false }));
          }
        }),
      );
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, userId, userLanguage]);

  // ── Render helpers ───────────────────────────────────────────────────────

  function renderItem({ item }: { item: Message }) {
    const isMe = item.senderId === userId;
    const translated = translations[item.id];
    const isTranslating = translating[item.id] ?? false;

    const senderInitial = (item.senderName ?? '?').charAt(0).toUpperCase();
    const senderColor = SENDER_COLORS[item.senderId.charCodeAt(0) % SENDER_COLORS.length] ?? '#4ECDC4';

    const avatarNode = isGroupChat ? (
      <View style={[styles.bubbleAvatar, { backgroundColor: senderColor }]}>
        <Text style={styles.bubbleAvatarInitial}>{senderInitial}</Text>
      </View>
    ) : participantId ? (
      <UserAvatar userId={participantId} fallbackEmoji={emoji} fallbackColor={color} size={32} />
    ) : (
      <View style={[styles.bubbleAvatar, { backgroundColor: color }]}>
        <Text style={styles.bubbleAvatarEmoji}>{emoji}</Text>
      </View>
    );

    return (
      <View style={styles.messageGroup}>
        <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowThem]}>
          {!isMe && avatarNode}
          <View style={styles.bubbleWrapper}>
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
              {!isMe && isTranslating && !translated
                ? <ActivityIndicator size={12} color="#888" style={{ alignSelf: 'flex-start' }} />
                : <Text style={isMe ? styles.bubbleMeText : styles.bubbleThemText}>
                    {(!isMe && translated) ? translated : item.body}
                  </Text>
              }
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#FF6B2B" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        {participantId ? (
          <UserAvatar userId={participantId} fallbackEmoji={emoji} fallbackColor={color} size={42} />
        ) : (
          <View style={[styles.headerAvatar, { backgroundColor: color }]}>
            <Text style={styles.headerAvatarEmoji}>{emoji}</Text>
          </View>
        )}
        <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
      </View>

      {/* Messages + Input */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>👋</Text>
              <Text style={styles.emptyText}>Say hi to {displayName}!</Text>
            </View>
          }
        />

        {/* Input bar */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={`Message ${displayName}…`}
            placeholderTextColor="#999"
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={() => void handleSend()}
          />
          {input.trim() ? (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.sendBtn, pressed && styles.btnPressed]}
              onPress={() => void handleSend()}
            >
              <Text style={styles.actionBtnText}>➤</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.voiceBtn, pressed && styles.btnPressed]}
              onPress={() => void startRecording()}
            >
              <Text style={styles.actionBtnText}>🎙️</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Voice Modal ─────────────────────────────────────────────────── */}
      <Modal visible={voicePhase !== null} transparent animationType="fade" onRequestClose={() => void cancelVoice()}>
        <View style={styles.modalOverlay}>

          {/* RECORDING phase */}
          {voicePhase === 'recording' && (
            <View style={styles.modalContent}>
              <View style={styles.pulseRing}>
                <View style={styles.pulseCore}>
                  <Text style={styles.modalMicEmoji}>🎙️</Text>
                </View>
              </View>
              <Text style={styles.recordingTimer}>{formatDuration(recordingSecs)}</Text>
              <Text style={styles.recordingHint}>Tap to stop</Text>
              <Pressable style={styles.stopRecordBtn} onPress={() => void stopAndTranscribe()}>
                <View style={styles.stopDot} />
              </Pressable>
            </View>
          )}

          {/* TRANSCRIBING phase */}
          {voicePhase === 'transcribing' && (
            <View style={styles.modalContent}>
              <ActivityIndicator size="large" color="#FF6B2B" />
              <Text style={styles.transcribingText}>Transcribing your voice…</Text>
            </View>
          )}

          {/* EDITING phase */}
          {voicePhase === 'editing' && (
            <View style={styles.editingContainer}>
              {/* Cancel button */}
              <Pressable
                style={({ pressed }) => [styles.circleBtn, styles.cancelBtn, pressed && styles.btnPressed]}
                onPress={() => void cancelVoice()}
              >
                <Text style={styles.circleBtnText}>✕</Text>
              </Pressable>

              {/* Editable transcription */}
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>✏️ Edit your message</Text>
                <TextInput
                  style={styles.transcriptInput}
                  value={voiceText}
                  onChangeText={setVoiceText}
                  multiline
                  autoFocus
                  placeholder="Transcribed text will appear here…"
                  placeholderTextColor="#AAA"
                />
              </View>

              {/* Send button */}
              <Pressable
                style={({ pressed }) => [
                  styles.circleBtn,
                  styles.voiceSendBtn,
                  !voiceText.trim() && styles.circleBtnDisabled,
                  pressed && voiceText.trim() ? styles.btnPressed : null,
                ]}
                onPress={() => void sendVoiceText()}
                disabled={!voiceText.trim()}
              >
                <Text style={styles.circleBtnText}>➤</Text>
              </Pressable>
            </View>
          )}

        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF9E6' },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B2B',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: '#1C1C2E',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: 26, color: '#FFFFFF', fontWeight: '900', lineHeight: 30 },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarEmoji: { fontSize: 22 },
  headerName: { flex: 1, fontSize: 20, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3 },

  // Messages
  messageList: { padding: 14, gap: 10, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowThem: { justifyContent: 'flex-start' },
  bubbleAvatar: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2, borderColor: '#1C1C2E',
    alignItems: 'center', justifyContent: 'center',
  },
  bubbleAvatarEmoji: { fontSize: 16 },
  bubbleAvatarInitial: { fontSize: 14, fontWeight: '900', color: '#1C1C2E' },
  bubbleWrapper: {
    flex: 1,
    maxWidth: '72%',
    gap: 4,
  },
  bubble: {
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 18, borderWidth: 2, borderColor: '#1C1C2E',
    shadowColor: '#1C1C2E', shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 3,
  },
  bubbleMe: { backgroundColor: '#FF6B2B', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  bubbleMeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  bubbleThemText: { color: '#1C1C2E', fontSize: 16, fontWeight: '500' },
  senderName: {
    fontSize: 11, fontWeight: '700', color: '#FF6B2B',
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  messageGroup: {
    marginVertical: 2,
  },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyText: { fontSize: 17, fontWeight: '700', color: '#888' },

  // Input bar
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12, gap: 10,
    borderTopWidth: 2.5, borderTopColor: '#1C1C2E',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 2.5, borderColor: '#1C1C2E', borderRadius: 999,
    maxHeight: 100, fontSize: 16,
    backgroundColor: '#FFF9E6', color: '#1C1C2E', fontWeight: '500',
  },
  actionBtn: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 2.5, borderColor: '#1C1C2E',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1C1C2E', shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 4,
  },
  sendBtn: { backgroundColor: '#FF6B2B' },
  voiceBtn: { backgroundColor: '#FFD93D' },
  btnPressed: {
    shadowOffset: { width: 1, height: 1 },
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  actionBtnText: { fontSize: 20, fontWeight: '900' },

  // Modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 28, 46, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },

  // Recording / Transcribing shared card
  modalContent: {
    backgroundColor: '#FFF9E6',
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    padding: 40,
    alignItems: 'center',
    gap: 20,
    width: '100%',
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 10,
  },

  // Pulse animation (static for now — use Animated for true pulsing)
  pulseRing: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255, 107, 43, 0.2)',
    borderWidth: 3, borderColor: '#FF6B2B',
    alignItems: 'center', justifyContent: 'center',
  },
  pulseCore: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#FF6B2B',
    borderWidth: 2.5, borderColor: '#1C1C2E',
    alignItems: 'center', justifyContent: 'center',
  },
  modalMicEmoji: { fontSize: 36 },
  recordingTimer: { fontSize: 36, fontWeight: '900', color: '#1C1C2E', letterSpacing: 2 },
  recordingHint: { fontSize: 15, fontWeight: '600', color: '#888' },
  stopRecordBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5, borderColor: '#1C1C2E',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1C1C2E', shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 5,
  },
  stopDot: {
    width: 22, height: 22, borderRadius: 4,
    backgroundColor: '#E53935',
  },

  transcribingText: { fontSize: 18, fontWeight: '700', color: '#1C1C2E' },

  // Editing layout
  editingContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
  },
  circleBtn: {
    width: 70, height: 70, borderRadius: 35,
    borderWidth: 3, borderColor: '#1C1C2E',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1C1C2E', shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 6,
  },
  cancelBtn: { backgroundColor: '#E53935' },
  voiceSendBtn: { backgroundColor: '#2ECC71' },
  circleBtnDisabled: { backgroundColor: '#CCC', borderColor: '#AAA', shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  circleBtnText: { fontSize: 26, fontWeight: '900', color: '#FFFFFF' },
  transcriptCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    padding: 20,
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
    gap: 10,
  },
  transcriptLabel: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  transcriptInput: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1C1C2E',
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: 26,
  },
});
