import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { ms, s, vs } from '../../lib/responsive';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4501';
const resolveMediaUrl = (url: string) => url.startsWith('/') ? `${API_URL}${url}` : url;
const SENDER_COLORS = ['#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD', '#FF9FF3', '#54A0FF', '#FFD93D', '#FF6B2B'];
const AVATAR_SIZE_HEADER = s(38);
const AVATAR_SIZE_BUBBLE = s(30);

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
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Audio, Video, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { apiRequest, uploadFile } from '../../lib/api-client';
import { VideoRecorderModal } from './VideoRecorderModal';
import { getAccessToken, getStoredUser } from '../../lib/auth/token-storage';
import { connectSocket, getSocket } from '../../lib/socket';
import type { ListMessagesResponse, Message, PlatformSettings } from '@constractor/types';
import * as FileSystem from 'expo-file-system';

type VoicePhase = 'recording' | 'transcribing' | 'editing';

type FlatItem =
  | { type: 'message'; data: Message }
  | { type: 'separator'; label: string; key: string };

function formatTime(date: Date | string): string {
  const d = new Date(date as string);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateLabel(date: Date | string): string {
  const d = new Date(date as string);
  const today = new Date();
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) return 'Today';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function isSameDay(a: Date | string, b: Date | string): boolean {
  const da = new Date(a as string);
  const db = new Date(b as string);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

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
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Voice state
  const [voicePhase, setVoicePhase] = useState<VoicePhase | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [recordingSecs, setRecordingSecs] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Voice message state
  const [vmPhase, setVmPhase] = useState<'recording' | 'uploading' | null>(null);
  const [vmSecs, setVmSecs] = useState(0);
  const vmRecordingRef = useRef<Audio.Recording | null>(null);
  const vmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Permissions + settings
  const [canSendVoice, setCanSendVoice] = useState(false);
  const [canSendVideo, setCanSendVideo] = useState(false);
  const [videoMaxDuration, setVideoMaxDuration] = useState(12);
  const [videoQuality, setVideoQuality] = useState(0.4);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);

  // Audio playback for received voice messages
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playbackRef = useRef<Audio.Sound | null>(null);

  const lastIdRef = useRef<string | undefined>(undefined);
  const oldestIdRef = useRef<string | undefined>(undefined);
  const flatListRef = useRef<FlatList<FlatItem>>(null);
  const translatingSet = useRef<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(null);
  const userLanguageRef = useRef<string>('en');
  const soundRef = useRef<Audio.Sound | null>(null);

  const fetchToken = useCallback(async () => {
    return (await getAccessToken()) ?? undefined;
  }, []);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingMore || !oldestIdRef.current || !id) return;
    setLoadingMore(true);
    try {
      const token = await fetchToken();
      const data = await apiRequest<ListMessagesResponse>(
        `/messaging/conversations/${id}/messages?before=${oldestIdRef.current}`,
        { token },
      );
      if (data.messages.length > 0) {
        setMessages((prev) => [...data.messages, ...prev]);
        oldestIdRef.current = data.messages[0]?.id;
      }
      setHasMore(data.messages.length === 50);
    } catch {
      // silently fail — user can retry by scrolling
    } finally {
      setLoadingMore(false);
    }
  }, [id, hasMore, loadingMore, fetchToken]);

  useEffect(() => {
    void (async () => {
      const user = await getStoredUser();
      const uid = user?.id ?? null;
      const lang = (user as { language?: string } | null)?.language ?? 'en';
      setUserId(uid);
      setUserLanguage(lang);
      userIdRef.current = uid;
      userLanguageRef.current = lang;

      const u = user as { canSendVoice?: boolean; canSendVideo?: boolean } | null;
      if (u?.canSendVoice) setCanSendVoice(true);
      if (u?.canSendVideo) setCanSendVideo(true);

      try {
        const token = await fetchToken();
        const s = await apiRequest<PlatformSettings>('/settings', { token });
        setVideoMaxDuration(s.videoMaxDurationSeconds);
        setVideoQuality(s.videoQuality);
      } catch { /* use defaults */ }
    })();
  }, [fetchToken]);

  // Preload notification sound once on mount
  useEffect(() => {
    void (async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('../../assets/sounds/message.wav') as number,
          { shouldPlay: false, volume: 1.0 },
        );
        soundRef.current = sound;
      } catch { /* silently skip if asset missing */ }
    })();
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  // Mark conversation as read when opened
  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const token = await fetchToken();
        await apiRequest(`/messaging/conversations/${id}/read`, { method: 'POST', token });
      } catch { /* ignore */ }
    })();
  }, [id, fetchToken]);

  // Mark as read again when leaving so home screen badge is cleared immediately.
  // The 300ms delay in the home screen useFocusEffect gives this request time to land.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!id) return;
        void fetchToken().then((t) =>
          apiRequest(`/messaging/conversations/${id}/read`, { method: 'POST', token: t }),
        ).catch(() => {});
      };
    }, [id, fetchToken]),
  );

  // Load messages + subscribe to realtime updates
  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        const token = await fetchToken();

        // Join the socket room BEFORE loading messages to avoid a race condition:
        // any message sent while the REST call is in-flight arrives via socket
        // and is deduplicated by the existing-ID check below.
        const sock = connectSocket(token ?? '');
        sock.emit('join_conversation', id);
        sock.on('new_message', (payload: { message: Message }) => {
          const incoming = payload.message;

          // Mark as read — user is actively viewing this chat
          void fetchToken().then((t) =>
            apiRequest(`/messaging/conversations/${id}/read`, { method: 'POST', token: t }),
          );

          const isOwn = incoming.senderId === userIdRef.current;
          if (!isOwn) playMessageSound();
          if (isOwn || incoming.translatedBody) {
            // Own message or already translated (server cache hit) → show immediately
            setMessages((prev) => {
              if (prev.some((m) => m.id === incoming.id)) return prev;
              lastIdRef.current = incoming.id;
              return [...prev, incoming];
            });
            return;
          }

          // Block the translate useEffect from racing with us
          translatingSet.current.add(incoming.id);

          // Translate before showing to avoid the untranslated→translated flicker.
          // If the REST initial-load response races and already put this message into
          // state (untranslated), we update it in-place rather than skipping it.
          void (async () => {
            let msg = incoming;
            try {
              const token = await fetchToken();
              const data = await apiRequest<{ translatedText: string }>('/translate', {
                method: 'POST',
                body: { text: incoming.body, targetLanguage: userLanguageRef.current, messageId: incoming.id },
                token,
              });
              msg = { ...incoming, translatedBody: data.translatedText };
            } catch {
              translatingSet.current.delete(incoming.id);
            }
            setMessages((prev) => {
              const alreadyInState = prev.some((m) => m.id === msg.id);
              if (alreadyInState) {
                // REST raced us — update the existing entry with the translation
                return prev.map((m) => (m.id === msg.id ? msg : m));
              }
              lastIdRef.current = msg.id;
              return [...prev, msg];
            });
          })();
        });

        const data = await apiRequest<ListMessagesResponse>(
          `/messaging/conversations/${id}/messages`,
          { token },
        );
        setMessages(data.messages);
        lastIdRef.current = data.messages.at(-1)?.id;
        oldestIdRef.current = data.messages[0]?.id;
        setHasMore(data.messages.length === 50);
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load messages');
      }
    };

    void load();

    return () => {
      getSocket()?.off('new_message');
      getSocket()?.emit('leave_conversation', id);
    };
  }, [id, fetchToken]);

  async function handleSend() {
    const body = input.trim();
    if (!body || !id) return;
    setInput('');
    try {
      const token = await fetchToken();
      await apiRequest<unknown>(
        `/messaging/conversations/${id}/messages`,
        { method: 'POST', body: { body }, token },
      );
      // Message will arrive via the new_message socket event
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
      await apiRequest<unknown>(
        `/messaging/conversations/${id}/messages`,
        { method: 'POST', body: { body }, token },
      );
      // Message will arrive via the new_message socket event
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to send');
    }
  }

  // ── Voice message (audio send — no transcription) ───────────────────────

  async function startVoiceMsg() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission denied', 'Microphone access is needed to send voice messages.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      vmRecordingRef.current = recording;
      setVmSecs(0);
      setVmPhase('recording');
      vmTimerRef.current = setInterval(() => setVmSecs((x) => x + 1), 1000);
    } catch {
      Alert.alert('Error', 'Could not start recording');
    }
  }

  async function stopAndSendVoiceMsg() {
    if (vmTimerRef.current) { clearInterval(vmTimerRef.current); vmTimerRef.current = null; }
    const recording = vmRecordingRef.current;
    if (!recording) return;
    setVmPhase('uploading');
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      vmRecordingRef.current = null;
      const uri = recording.getURI();
      if (!uri) throw new Error('No audio URI');
      const token = (await fetchToken()) ?? '';
      const { url } = await uploadFile(uri, 'audio/m4a', token);
      await apiRequest<unknown>(`/messaging/conversations/${id}/messages`, {
        method: 'POST',
        body: { body: '', audioUrl: url },
        token,
      });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not send voice message');
    } finally {
      setVmPhase(null);
      setVmSecs(0);
    }
  }

  async function cancelVoiceMsg() {
    if (vmTimerRef.current) { clearInterval(vmTimerRef.current); vmTimerRef.current = null; }
    const recording = vmRecordingRef.current;
    if (recording) {
      try { await recording.stopAndUnloadAsync(); } catch { /* ignore */ }
      vmRecordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    setVmPhase(null);
    setVmSecs(0);
  }

  // ── Video message ─────────────────────────────────────────────────────────

  async function handleVideoRecorded(uri: string) {
    setShowVideoRecorder(false);
    setVmPhase('uploading');
    try {
      const token = (await fetchToken()) ?? '';
      const { url } = await uploadFile(uri, 'video/mp4', token);
      await apiRequest<unknown>(`/messaging/conversations/${id}/messages`, {
        method: 'POST',
        body: { body: '', videoUrl: url },
        token,
      });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not send video message');
    } finally {
      setVmPhase(null);
    }
  }

  // ── Audio playback for voice message bubbles ──────────────────────────────

  async function toggleAudioPlay(msgId: string, audioUrl: string) {
    if (playingId === msgId) {
      await playbackRef.current?.stopAsync();
      await playbackRef.current?.unloadAsync();
      playbackRef.current = null;
      setPlayingId(null);
      return;
    }
    if (playbackRef.current) {
      await playbackRef.current.stopAsync();
      await playbackRef.current.unloadAsync();
      playbackRef.current = null;
    }
    setPlayingId(msgId);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true });
      playbackRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || status.didJustFinish) {
          setPlayingId(null);
          void sound.unloadAsync();
          playbackRef.current = null;
        }
      });
    } catch {
      setPlayingId(null);
    }
  }

  function playMessageSound() {
    if (voicePhase !== null) return;
    void soundRef.current?.replayAsync().catch(() => {});
  }

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ── Translate socket-delivered messages (initial load messages already have translatedBody) ──

  useEffect(() => {
    if (!userId || !userLanguage) return;

    const needsTranslation = messages.filter(
      (m) => m.senderId !== userId && !m.translatedBody && !translatingSet.current.has(m.id),
    );
    if (needsTranslation.length === 0) return;

    needsTranslation.forEach((m) => translatingSet.current.add(m.id));

    void (async () => {
      const token = await fetchToken();
      await Promise.all(
        needsTranslation.map(async (m) => {
          try {
            const data = await apiRequest<{ translatedText: string }>('/translate', {
              method: 'POST',
              body: { text: m.body, targetLanguage: userLanguage, messageId: m.id },
              token,
            });
            setMessages((prev) =>
              prev.map((msg) => msg.id === m.id ? { ...msg, translatedBody: data.translatedText } : msg),
            );
          } catch {
            translatingSet.current.delete(m.id);
          }
        }),
      );
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, userId, userLanguage]);

  // ── Flat list data: interleave date separators between day groups ────────

  const flatData = useMemo((): FlatItem[] => {
    const reversed = [...messages].reverse();
    const result: FlatItem[] = [];
    for (let i = 0; i < reversed.length; i++) {
      const msg = reversed[i];
      if (!msg) continue;
      result.push({ type: 'message', data: msg });
      const nextMsg = reversed[i + 1];
      if (!nextMsg || !isSameDay(msg.createdAt, nextMsg.createdAt)) {
        const d = new Date(msg.createdAt as unknown as string);
        const key = `sep-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        result.push({ type: 'separator', label: formatDateLabel(msg.createdAt), key });
      }
    }
    return result;
  }, [messages]);

  // ── Render helpers ───────────────────────────────────────────────────────

  function renderItem({ item }: { item: FlatItem }) {
    if (item.type === 'separator') {
      return (
        <View style={styles.dateSeparatorRow}>
          <View style={styles.dateSeparatorPill}>
            <Text style={styles.dateSeparatorText}>{item.label}</Text>
          </View>
        </View>
      );
    }

    const { data: msg } = item;
    const isMe = msg.senderId === userId;
    const translated = msg.translatedBody;
    const isTranslating = false;

    const senderInitial = (msg.senderName ?? '?').charAt(0).toUpperCase();
    const senderColor = SENDER_COLORS[msg.senderId.charCodeAt(0) % SENDER_COLORS.length] ?? '#4ECDC4';

    const avatarNode = isGroupChat ? (
      <View style={[styles.bubbleAvatar, { backgroundColor: senderColor }]}>
        <Text style={styles.bubbleAvatarInitial}>{senderInitial}</Text>
      </View>
    ) : participantId ? (
      <UserAvatar userId={participantId} fallbackEmoji={emoji} fallbackColor={color} size={AVATAR_SIZE_BUBBLE} />
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
              {!isMe && <Text style={styles.senderName}>{msg.senderName}</Text>}

              {msg.audioUrl ? (
                <Pressable
                  style={styles.audioBubble}
                  onPress={() => void toggleAudioPlay(msg.id, resolveMediaUrl(msg.audioUrl!))}
                >
                  <Text style={styles.audioBubbleIcon}>
                    {playingId === msg.id ? '⏹' : '▶'}
                  </Text>
                  <Text style={[styles.audioBubbleLabel, isMe ? styles.bubbleMeText : styles.bubbleThemText]}>
                    {playingId === msg.id ? 'Playing…' : '🎵 Voice message'}
                  </Text>
                </Pressable>
              ) : msg.videoUrl ? (
                <Video
                  source={{ uri: resolveMediaUrl(msg.videoUrl) }}
                  useNativeControls
                  resizeMode={ResizeMode.COVER}
                  style={styles.videoBubble}
                />
              ) : (
                !isMe && isTranslating && !translated
                  ? <ActivityIndicator size={12} color="#888" style={{ alignSelf: 'flex-start' }} />
                  : <Text style={isMe ? styles.bubbleMeText : styles.bubbleThemText}>
                      {(!isMe && translated) ? translated : msg.body}
                    </Text>
              )}

              <Text style={[styles.timeText, isMe ? styles.timeTextMe : styles.timeTextThem]}>
                {formatTime(msg.createdAt)}
              </Text>
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
          <UserAvatar userId={participantId} fallbackEmoji={emoji} fallbackColor={color} size={AVATAR_SIZE_HEADER} />
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
          data={flatData}
          inverted
          keyExtractor={(item) => item.type === 'message' ? item.data.id : item.key}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator size="small" color="#FF6B2B" style={{ padding: ms(12) }} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>👋</Text>
              <Text style={styles.emptyText}>Say hi to {displayName}!</Text>
            </View>
          }
        />

        {/* Input bar */}
        <View style={styles.inputRow}>
          {/* Media buttons (left side) */}
          {canSendVoice && (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.voiceMsgBtn, pressed && styles.btnPressed]}
              onPress={() => void startVoiceMsg()}
            >
              <Text style={styles.actionBtnText}>🎵</Text>
            </Pressable>
          )}
          {canSendVideo && (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.videoMsgBtn, pressed && styles.btnPressed]}
              onPress={() => setShowVideoRecorder(true)}
            >
              <Text style={styles.actionBtnText}>📹</Text>
            </Pressable>
          )}

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

      {/* ── Voice Message Modal ─────────────────────────────────────────── */}
      <Modal visible={vmPhase !== null} transparent animationType="fade" onRequestClose={() => void cancelVoiceMsg()}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {vmPhase === 'recording' ? (
              <>
                <View style={styles.pulseRing}>
                  <View style={[styles.pulseCore, { backgroundColor: '#4ECDC4' }]}>
                    <Text style={styles.modalMicEmoji}>🎵</Text>
                  </View>
                </View>
                <Text style={styles.recordingTimer}>{formatDuration(vmSecs)}</Text>
                <Text style={styles.recordingHint}>Voice message recording</Text>
                <View style={{ flexDirection: 'row', gap: ms(16), marginTop: ms(8) }}>
                  <Pressable style={[styles.circleBtn, styles.cancelBtn]} onPress={() => void cancelVoiceMsg()}>
                    <Text style={styles.circleBtnText}>✕</Text>
                  </Pressable>
                  <Pressable style={[styles.circleBtn, styles.voiceSendBtn]} onPress={() => void stopAndSendVoiceMsg()}>
                    <Text style={styles.circleBtnText}>➤</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color="#4ECDC4" />
                <Text style={styles.transcribingText}>Sending voice message…</Text>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Voice Modal ─────────────────────────────────────────────────── */}
      <Modal visible={voicePhase !== null} transparent animationType="fade" onRequestClose={() => void cancelVoice()}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.editingKAV}
            >
              <View style={styles.editingContainer}>
                {/* Cancel button */}
                <Pressable
                  style={({ pressed }) => [styles.circleBtn, styles.cancelBtn, pressed && styles.btnPressed]}
                  onPress={() => void cancelVoice()}
                >
                  <Text style={styles.circleBtnText}>✕</Text>
                </Pressable>

                {/* Editable transcription */}
                <Pressable style={styles.transcriptCard} onPress={Keyboard.dismiss}>
                  <Text style={styles.transcriptLabel}>✏️ Edit your message</Text>
                  <TextInput
                    style={styles.transcriptInput}
                    value={voiceText}
                    onChangeText={setVoiceText}
                    multiline
                    autoFocus
                    placeholder="Transcribed text will appear here…"
                    placeholderTextColor="#AAA"
                    returnKeyType="done"
                    blurOnSubmit
                  />
                  <Text style={styles.keyboardHint}>Tap outside to close keyboard</Text>
                </Pressable>

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
            </KeyboardAvoidingView>
          )}

          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <VideoRecorderModal
        visible={showVideoRecorder}
        maxDuration={videoMaxDuration}
        onClose={() => setShowVideoRecorder(false)}
        onRecorded={(uri) => void handleVideoRecorded(uri)}
      />
    </SafeAreaView>
  );
}

const BTN = s(44);
const BUBBLE_AVATAR = s(30);
const HEADER_AVATAR = s(38);
const BACK_BTN = s(36);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF9E6' },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B2B',
    paddingHorizontal: ms(12),
    paddingVertical: ms(10),
    borderBottomWidth: 2.5,
    borderBottomColor: '#1C1C2E',
    gap: ms(10),
  },
  backBtn: {
    width: BACK_BTN,
    height: BACK_BTN,
    borderRadius: BACK_BTN / 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  backBtnText: { fontSize: ms(24), color: '#FFFFFF', fontWeight: '900', lineHeight: ms(28) },
  headerAvatar: {
    width: HEADER_AVATAR,
    height: HEADER_AVATAR,
    borderRadius: HEADER_AVATAR / 2,
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerAvatarEmoji: { fontSize: ms(20) },
  headerName: { flex: 1, fontSize: ms(18), fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.3 },

  // Messages
  messageList: { padding: ms(12), gap: ms(8), paddingBottom: ms(8) },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: ms(6) },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowThem: { justifyContent: 'flex-start' },
  bubbleAvatar: {
    width: BUBBLE_AVATAR, height: BUBBLE_AVATAR, borderRadius: BUBBLE_AVATAR / 2,
    borderWidth: 2, borderColor: '#1C1C2E',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bubbleAvatarEmoji: { fontSize: ms(14) },
  bubbleAvatarInitial: { fontSize: ms(13), fontWeight: '900', color: '#1C1C2E' },
  bubbleWrapper: {
    flex: 1,
    maxWidth: '72%',
    gap: ms(3),
  },
  bubble: {
    paddingVertical: ms(9), paddingHorizontal: ms(13),
    borderRadius: ms(16), borderWidth: 2, borderColor: '#1C1C2E',
    shadowColor: '#1C1C2E', shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 3,
  },
  bubbleMe: { backgroundColor: '#FF6B2B', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  bubbleMeText: { color: '#FFFFFF', fontSize: ms(15), fontWeight: '500' },
  bubbleThemText: { color: '#1C1C2E', fontSize: ms(15), fontWeight: '500' },
  senderName: {
    fontSize: ms(10), fontWeight: '700', color: '#FF6B2B',
    marginBottom: ms(3), textTransform: 'uppercase', letterSpacing: 0.5,
  },
  messageGroup: {
    marginVertical: ms(2),
  },
  dateSeparatorRow: {
    alignItems: 'center',
    marginVertical: ms(10),
  },
  dateSeparatorPill: {
    backgroundColor: 'rgba(28,28,46,0.55)',
    borderRadius: ms(12),
    paddingHorizontal: ms(14),
    paddingVertical: ms(4),
  },
  dateSeparatorText: {
    color: '#FFFFFF',
    fontSize: ms(12),
    fontWeight: '600',
  },
  timeText: {
    fontSize: ms(11),
    alignSelf: 'flex-end',
    marginTop: ms(3),
  },
  timeTextMe: {
    color: 'rgba(255,255,255,0.65)',
  },
  timeTextThem: {
    color: '#AAA',
  },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: vs(60), gap: ms(10) },
  emptyEmoji: { fontSize: ms(48) },
  emptyText: { fontSize: ms(15), fontWeight: '700', color: '#888' },

  // Input bar
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: ms(10), gap: ms(8),
    borderTopWidth: 2.5, borderTopColor: '#1C1C2E',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    paddingHorizontal: ms(14), paddingVertical: ms(10),
    borderWidth: 2.5, borderColor: '#1C1C2E', borderRadius: 999,
    maxHeight: vs(90), fontSize: ms(15),
    backgroundColor: '#FFF9E6', color: '#1C1C2E', fontWeight: '500',
  },
  actionBtn: {
    width: BTN, height: BTN, borderRadius: BTN / 2,
    borderWidth: 2.5, borderColor: '#1C1C2E',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1C1C2E', shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 4,
    flexShrink: 0,
  },
  sendBtn: { backgroundColor: '#FF6B2B' },
  voiceBtn: { backgroundColor: '#FFD93D' },
  btnPressed: {
    shadowOffset: { width: 1, height: 1 },
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  actionBtnText: { fontSize: ms(18), fontWeight: '900' },

  // Modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 28, 46, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: ms(20),
  },

  // Recording / Transcribing shared card
  modalContent: {
    backgroundColor: '#FFF9E6',
    borderRadius: ms(24),
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    padding: ms(28),
    alignItems: 'center',
    gap: ms(16),
    width: '100%',
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 10,
  },

  // Pulse animation
  pulseRing: {
    width: s(88), height: s(88), borderRadius: s(44),
    backgroundColor: 'rgba(255, 107, 43, 0.2)',
    borderWidth: 3, borderColor: '#FF6B2B',
    alignItems: 'center', justifyContent: 'center',
  },
  pulseCore: {
    width: s(66), height: s(66), borderRadius: s(33),
    backgroundColor: '#FF6B2B',
    borderWidth: 2.5, borderColor: '#1C1C2E',
    alignItems: 'center', justifyContent: 'center',
  },
  modalMicEmoji: { fontSize: ms(32) },
  recordingTimer: { fontSize: ms(32), fontWeight: '900', color: '#1C1C2E', letterSpacing: 2 },
  recordingHint: { fontSize: ms(14), fontWeight: '600', color: '#888' },
  stopRecordBtn: {
    width: s(54), height: s(54), borderRadius: s(27),
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5, borderColor: '#1C1C2E',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1C1C2E', shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 5,
  },
  stopDot: {
    width: ms(20), height: ms(20), borderRadius: ms(4),
    backgroundColor: '#E53935',
  },

  transcribingText: { fontSize: ms(16), fontWeight: '700', color: '#1C1C2E' },

  // Editing layout
  editingKAV: {
    width: '100%',
  },
  editingContainer: {
    width: '100%',
    alignItems: 'center',
    gap: ms(20),
  },
  circleBtn: {
    width: s(60), height: s(60), borderRadius: s(30),
    borderWidth: 3, borderColor: '#1C1C2E',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1C1C2E', shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 6,
  },
  cancelBtn: { backgroundColor: '#E53935' },
  voiceSendBtn: { backgroundColor: '#2ECC71' },
  circleBtnDisabled: { backgroundColor: '#CCC', borderColor: '#AAA', shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  circleBtnText: { fontSize: ms(22), fontWeight: '900', color: '#FFFFFF' },
  transcriptCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: ms(16),
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    padding: ms(16),
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
    gap: ms(8),
  },
  transcriptLabel: { fontSize: ms(12), fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: ms(4) },
  keyboardHint: { fontSize: ms(11), color: '#BBB', textAlign: 'center', marginTop: ms(6) },
  transcriptInput: {
    fontSize: ms(16),
    fontWeight: '500',
    color: '#1C1C2E',
    minHeight: vs(100),
    textAlignVertical: 'top',
    lineHeight: ms(24),
  },

  // Media message buttons
  voiceMsgBtn: { backgroundColor: '#4ECDC4' },
  videoMsgBtn: { backgroundColor: '#A29BFE' },

  // Audio bubble
  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    paddingVertical: ms(4),
  },
  audioBubbleIcon: { fontSize: ms(22) },
  audioBubbleLabel: { fontWeight: '600' },

  // Video bubble
  videoBubble: {
    width: s(220),
    height: s(160),
    borderRadius: ms(8),
    overflow: 'hidden',
  },
});
