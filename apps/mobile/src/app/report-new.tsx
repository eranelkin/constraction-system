import { useState, useRef } from 'react';
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
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { getAccessToken, getStoredUser } from '@/lib/auth/token-storage';
import { apiRequest } from '@/lib/api-client';
import { ms, s, vs } from '@/lib/responsive';
import type { FieldReportType } from '@constractor/types';

const PROJECTS = ['Downtown Tower', 'Harbor Bridge', 'Riverside Complex', 'Metro Station'];

const TYPES: { value: FieldReportType; label: string; emoji: string }[] = [
  { value: 'progress', label: 'Progress', emoji: '📈' },
  { value: 'issue',    label: 'Issue',    emoji: '⚠️' },
  { value: 'delay',    label: 'Delay',    emoji: '⏰' },
  { value: 'safety',   label: 'Safety',   emoji: '🦺' },
];

export default function ReportNewScreen() {
  const [photo, setPhoto] = useState<{ base64: string; uri: string } | null>(null);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<FieldReportType>('progress');
  const [project, setProject] = useState(PROJECTS[0] ?? '');
  const [location, setLocation] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Camera access is needed to take photos.');
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
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission denied', 'Microphone access is needed for voice notes.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      Alert.alert('Error', 'Could not start recording');
    }
  }

  async function stopAndTranscribe() {
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
    } catch {
      Alert.alert('Error', 'Could not transcribe audio. Try again.');
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleSubmit() {
    if (!location.trim()) {
      Alert.alert('Missing field', 'Please enter a location.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Missing field', 'Please add a description or record a voice note.');
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

      await apiRequest('/field-reports', {
        method: 'POST',
        body,
        token: token ?? undefined,
      });
      router.back();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#FF6B2B" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
          <Text style={styles.headerTitle}>New Report</Text>
          <View style={{ width: s(36) }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photo */}
          <Pressable style={styles.photoBox} onPress={() => void handleTakePhoto()}>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoIcon}>📷</Text>
                <Text style={styles.photoHint}>Tap to take photo</Text>
              </View>
            )}
          </Pressable>

          {/* Voice + Description */}
          <View style={styles.section}>
            <Text style={styles.label}>Description</Text>
            <Pressable
              style={[styles.micBtn, isRecording && styles.micBtnActive]}
              onPressIn={() => void startRecording()}
              onPressOut={() => void stopAndTranscribe()}
              disabled={isTranscribing}
            >
              {isTranscribing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.micIcon}>{isRecording ? '🔴' : '🎤'}</Text>
              )}
              <Text style={styles.micText}>
                {isTranscribing
                  ? 'Transcribing…'
                  : isRecording
                    ? 'Release to transcribe'
                    : 'Hold to record voice note'}
              </Text>
            </Pressable>
            <TextInput
              style={styles.textArea}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the situation…"
              placeholderTextColor="#aaa"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Type */}
          <View style={styles.section}>
            <Text style={styles.label}>Type</Text>
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
            <Text style={styles.label}>Project</Text>
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
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Floor 3, Grid C5"
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
              <Text style={styles.submitText}>Submit Report</Text>
            )}
          </Pressable>

          <View style={{ height: vs(20) }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: ms(16),
    paddingVertical: ms(12),
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
  content: {
    padding: ms(16),
    gap: ms(4),
  },
  photoBox: {
    borderWidth: 2.5,
    borderColor: '#1C1C2E',
    borderRadius: ms(16),
    overflow: 'hidden',
    height: vs(180),
    backgroundColor: '#FFFFFF',
    marginBottom: ms(12),
    shadowColor: '#1C1C2E',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 5,
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
  },
  photoIcon: {
    fontSize: ms(40),
  },
  photoHint: {
    fontSize: ms(14),
    fontWeight: '700',
    color: '#888',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
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
  micBtnActive: {
    backgroundColor: '#E53E3E',
    borderColor: '#E53E3E',
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
