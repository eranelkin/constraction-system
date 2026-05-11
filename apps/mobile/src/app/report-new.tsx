import { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Audio, Video, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { getAccessToken, getStoredUser } from '@/lib/auth/token-storage';
import { apiRequest, uploadFile } from '@/lib/api-client';
import { VideoRecorderModal } from './(messages)/VideoRecorderModal';
import { ms, s, vs } from '@/lib/responsive';
import { useFieldExtraction, type FieldDefinition } from '@/lib/hooks/useFieldExtraction';
import type { FieldReportType } from '@constractor/types';

const PROJECTS = ['Downtown Tower', 'Harbor Bridge', 'Riverside Complex', 'Metro Station'];

export default function ReportNewScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';

  const TYPES = useMemo((): { value: FieldReportType; label: string; emoji: string }[] => [
    { value: 'progress', label: t('report.types.progress'), emoji: '📈' },
    { value: 'issue',    label: t('report.types.issue'),    emoji: '⚠️' },
    { value: 'delay',    label: t('report.types.delay'),    emoji: '⏰' },
    { value: 'safety',   label: t('report.types.safety'),   emoji: '🦺' },
  ], [t]);

  const [photo, setPhoto] = useState<{ base64: string; uri: string } | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<FieldReportType>('progress');
  const [project, setProject] = useState(PROJECTS[0] ?? '');
  const [location, setLocation] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingReadyRef = useRef<Promise<void> | null>(null);
  const isRecordingRef = useRef(false);

  const { isExtracting, extract } = useFieldExtraction();

  const EXTRACT_FIELDS: FieldDefinition[] = useMemo(() => [
    { name: 'type',     type: 'enum',   description: 'nature of the report', options: TYPES.map((t) => t.value) },
    { name: 'project',  type: 'enum',   description: 'project or site name', options: PROJECTS },
    { name: 'location', type: 'string', description: 'specific spot (floor, zone, elevator, area)' },
  ], [TYPES]);

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('report.permissionDeniedTitle'), t('report.permissionCamera'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.5,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        setPhoto({ base64: asset.base64, uri: asset.uri });
      }
    }
  }

  async function startRecording() {
    let resolve!: () => void;
    recordingReadyRef.current = new Promise<void>((res) => { resolve = res; });
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(t('report.permissionDeniedTitle'), t('report.permissionMic'));
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      Alert.alert(t('common.error'), t('report.couldNotRecord'));
    } finally {
      resolve();
      recordingReadyRef.current = null;
    }
  }

  async function stopAndTranscribe() {
    // Wait for recording to finish initializing if start is still in progress
    if (recordingReadyRef.current) await recordingReadyRef.current;
    const recording = recordingRef.current;
    if (!recording) return;
    setIsRecording(false);
    setIsTranscribing(true);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error('No audio URI');
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const token = await getAccessToken();
      const data = await apiRequest<{ text: string }>('/speech/transcribe', {
        method: 'POST',
        body: { audio: base64, mimeType: 'audio/m4a' },
        token: token ?? undefined,
      });
      setDescription(data.text);

      void extract(data.text, EXTRACT_FIELDS).then((extracted) => {
        if (extracted['type'])     setType(extracted['type'] as FieldReportType);
        if (extracted['project'])  setProject(extracted['project']);
        if (extracted['location']) setLocation(extracted['location']);
      });
    } catch {
      Alert.alert(t('common.error'), t('report.couldNotTranscribe'));
    } finally {
      setIsTranscribing(false);
    }
  }

  async function cancelRecording() {
    if (recordingReadyRef.current) await recordingReadyRef.current;
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    setIsRecording(false);
    try { await recording.stopAndUnloadAsync(); } catch { /* ignore */ }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  }

  async function handleSubmit() {
    if (!location.trim()) {
      Alert.alert(t('report.missingField'), t('report.errorMissingLocation'));
      return;
    }
    if (!description.trim()) {
      Alert.alert(t('report.missingField'), t('report.errorMissingDescription'));
      return;
    }
    setIsSubmitting(true);
    try {
      const user = await getStoredUser();
      if (!user) throw new Error('Not authenticated');
      const token = await getAccessToken();

      const body: Record<string, unknown> = {
        type,
        project,
        location: location.trim(),
        description: description.trim(),
        reportedBy: user.id,
      };
      if (photo) {
        body['photoBase64'] = photo.base64;
        body['photoMimeType'] = 'image/jpeg';
      }
      if (videoUri) {
        const mimeType = videoUri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
        const { url } = await uploadFile(videoUri, mimeType, token ?? '');
        body['videoUrl'] = url;
      }

      await apiRequest('/field-reports', {
        method: 'POST',
        body,
        token: token ?? undefined,
      });
      router.back();
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('report.errorSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header extends behind the status bar so orange fills that strip */}
        <View style={[styles.header, { paddingTop: insets.top + ms(12) }]}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t('report.header')}</Text>
          <View style={{ width: s(36) }} />
        </View>

        {/* Voice + Description — pinned above ScrollView so no responder conflict */}
        <View style={styles.voiceBlock}>
          <View
            style={[styles.micBtn, isRecording && styles.micBtnActive, isTranscribing && styles.micBtnDisabled]}
            onStartShouldSetResponder={() => !isTranscribing}
            onResponderGrant={() => { isRecordingRef.current = true; void startRecording(); }}
            onResponderRelease={() => { isRecordingRef.current = false; void stopAndTranscribe(); }}
            onResponderTerminate={() => { isRecordingRef.current = false; void cancelRecording(); }}
            onResponderTerminationRequest={() => !isRecordingRef.current}
          >
            {isTranscribing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.micIcon}>{isRecording ? '🔴' : '🎤'}</Text>
            )}
            <Text style={styles.micText}>
              {isTranscribing
                ? t('report.voiceTranscribing')
                : isRecording
                  ? t('report.voiceRelease')
                  : t('report.voiceHold')}
            </Text>
          </View>
          {isExtracting && (
            <View style={styles.extractingRow}>
              <ActivityIndicator size="small" color="#FF6B2B" />
              <Text style={styles.extractingText}>{t('common.analyzing')}</Text>
            </View>
          )}
          <Text style={styles.label}>{t('report.descriptionLabel')}</Text>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={setDescription}
            placeholder={t('report.descriptionPlaceholder')}
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photo + Video — mutually exclusive */}
          <View style={styles.mediaRow}>
            {/* Camera */}
            {!videoUri && (
              <View style={styles.mediaWrapper}>
                <View style={styles.mediaBox}>
                  {photo ? (
                    <Image source={{ uri: photo.uri }} style={styles.mediaPreview} resizeMode="cover" />
                  ) : (
                    <Pressable style={styles.mediaPlaceholderBtn} onPress={() => void handleTakePhoto()}>
                      <Text style={styles.mediaIcon}>📷</Text>
                    </Pressable>
                  )}
                </View>
                {photo && (
                  <Pressable style={styles.mediaDeleteBtn} onPress={() => setPhoto(null)}>
                    <Text style={styles.mediaDeleteText}>✕</Text>
                  </Pressable>
                )}
              </View>
            )}
            {/* Video */}
            {!photo && (
              <View style={styles.mediaWrapper}>
                <View style={styles.mediaBox}>
                  {videoUri ? (
                    <Video
                      source={{ uri: videoUri }}
                      style={styles.mediaPreview}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={false}
                      useNativeControls
                    />
                  ) : (
                    <Pressable style={styles.mediaPlaceholderBtn} onPress={() => setShowVideoRecorder(true)}>
                      <Text style={styles.mediaIcon}>🎬</Text>
                    </Pressable>
                  )}
                </View>
                {videoUri && (
                  <Pressable style={styles.mediaDeleteBtn} onPress={() => setVideoUri(null)}>
                    <Text style={styles.mediaDeleteText}>✕</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* Type */}
          <View style={styles.section}>
            <Text style={styles.label}>{t('report.typeLabel')}</Text>
            <View style={styles.chipRow}>
              {TYPES.map((t) => (
                <Pressable
                  key={t.value}
                  style={[styles.chip, type === t.value && styles.chipActive]}
                  onPress={() => setType(t.value)}
                >
                  <Text style={[styles.chipText, type === t.value && styles.chipTextActive]}>
                    {t.emoji} {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Project */}
          <View style={styles.section}>
            <Text style={styles.label}>{t('report.projectLabel')}</Text>
            <View style={styles.chipRow}>
              {PROJECTS.map((p) => (
                <Pressable
                  key={p}
                  style={[styles.chip, project === p && styles.chipActive]}
                  onPress={() => setProject(p)}
                >
                  <Text
                    style={[styles.chipText, project === p && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Location */}
          <View style={styles.section}>
            <Text style={styles.label}>{t('report.locationLabel')}</Text>
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder={t('report.locationPlaceholder')}
              placeholderTextColor="#aaa"
            />
          </View>

          {/* Submit */}
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              (pressed || isSubmitting) && styles.submitBtnPressed,
            ]}
            onPress={() => void handleSubmit()}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>{t('report.submit')}</Text>
            )}
          </Pressable>

          <View style={{ height: vs(20) }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <VideoRecorderModal
        visible={showVideoRecorder}
        maxDuration={30}
        onClose={() => setShowVideoRecorder(false)}
        onRecorded={(uri) => { setVideoUri(uri); setShowVideoRecorder(false); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFF9E6',
  },
  header: {
    backgroundColor: '#FF6B2B',
    paddingHorizontal: ms(16),
    paddingBottom: ms(12),
    borderBottomWidth: 2.5,
    borderBottomColor: '#1C1C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: s(36),
    height: s(36),
    borderRadius: s(18),
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: ms(16),
    fontWeight: '900',
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: ms(20),
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  voiceBlock: {
    paddingHorizontal: ms(16),
    paddingTop: ms(12),
    paddingBottom: ms(8),
    gap: ms(8),
    backgroundColor: '#FFF9E6',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(28,28,46,0.08)',
  },
  content: {
    padding: ms(16),
    gap: ms(4),
  },
  mediaRow: {
    flexDirection: 'row',
    gap: ms(10),
    marginBottom: ms(12),
  },
  mediaWrapper: {
    flex: 1,
    position: 'relative',
  },
  mediaBox: {
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    borderRadius: ms(16),
    overflow: 'hidden',
    height: vs(150),
    backgroundColor: '#FFFFFF',
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 5,
  },
  mediaPlaceholderBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaIcon: {
    fontSize: ms(36),
  },
  mediaPreview: {
    width: '100%',
    height: '100%',
  },
  mediaDeleteBtn: {
    position: 'absolute',
    top: ms(6),
    right: ms(6),
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    backgroundColor: 'rgba(229,57,53,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  mediaDeleteText: {
    color: '#FFFFFF',
    fontSize: ms(13),
    fontWeight: '900',
    lineHeight: ms(16),
  },
  section: {
    marginBottom: ms(16),
    gap: ms(8),
  },
  label: {
    fontSize: ms(13),
    fontWeight: '800',
    color: '#1C1C2E',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  micBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    backgroundColor: '#1C1C2E',
    borderRadius: ms(12),
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    paddingVertical: ms(12),
    paddingHorizontal: ms(16),
  },
  extractingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
  },
  extractingText: {
    fontSize: ms(13),
    fontWeight: '600',
    color: '#FF6B2B',
  },
  micBtnActive: {
    backgroundColor: '#E53E3E',
    borderColor: '#E53E3E',
  },
  micBtnDisabled: {
    opacity: 0.5,
  },
  micIcon: {
    fontSize: ms(20),
  },
  micText: {
    fontSize: ms(14),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  textArea: {
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    borderRadius: ms(12),
    backgroundColor: '#FFFFFF',
    padding: ms(12),
    fontSize: ms(15),
    fontWeight: '500',
    color: '#1C1C2E',
    minHeight: vs(80),
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ms(8),
  },
  chip: {
    paddingVertical: ms(8),
    paddingHorizontal: ms(14),
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    backgroundColor: '#FFFFFF',
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  chipActive: {
    backgroundColor: '#FF6B2B',
  },
  chipText: {
    fontSize: ms(13),
    fontWeight: '800',
    color: '#1C1C2E',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  input: {
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    borderRadius: ms(12),
    backgroundColor: '#FFFFFF',
    paddingHorizontal: ms(14),
    paddingVertical: ms(12),
    fontSize: ms(15),
    fontWeight: '500',
    color: '#1C1C2E',
  },
  submitBtn: {
    backgroundColor: '#FF6B2B',
    borderRadius: ms(14),
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    paddingVertical: ms(16),
    alignItems: 'center',
    marginTop: ms(8),
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  submitBtnPressed: {
    shadowOffset: { width: 2, height: 2 },
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  submitText: {
    fontSize: ms(17),
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
