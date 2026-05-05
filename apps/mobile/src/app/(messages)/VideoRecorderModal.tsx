import { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

interface Props {
  visible: boolean;
  maxDuration: number; // seconds
  onClose: () => void;
  onRecorded: (uri: string) => void;
}

export function VideoRecorderModal({ visible, maxDuration, onClose, onRecorded }: Props) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      stopTimer();
      setIsRecording(false);
      setElapsed(0);
    }
  }, [visible]);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function handleRecordPress() {
    if (isRecording) {
      cameraRef.current?.stopRecording();
      return;
    }

    if (!cameraPermission?.granted) await requestCameraPermission();
    if (!micPermission?.granted) await requestMicPermission();

    if (!cameraRef.current) return;

    setIsRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    try {
      const video = await cameraRef.current.recordAsync({ maxDuration });
      if (video?.uri) onRecorded(video.uri);
      else onClose();
    } catch {
      onClose();
    } finally {
      stopTimer();
      setIsRecording(false);
      setElapsed(0);
    }
  }

  const remaining = Math.max(0, maxDuration - elapsed);
  const progress = maxDuration > 0 ? elapsed / maxDuration : 0;

  const permissionsGranted = cameraPermission?.granted && micPermission?.granted;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.container}>
        {permissionsGranted === false ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Camera and microphone access is required.</Text>
            <Pressable style={styles.permissionBtn} onPress={async () => {
              await requestCameraPermission();
              await requestMicPermission();
            }}>
              <Text style={styles.permissionBtnText}>Grant permissions</Text>
            </Pressable>
            <Pressable style={[styles.permissionBtn, { marginTop: 8, backgroundColor: '#444' }]} onPress={onClose}>
              <Text style={styles.permissionBtnText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode="video" />

            {/* Progress bar */}
            {isRecording && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
              </View>
            )}

            {/* Timer */}
            <View style={styles.timerRow}>
              {isRecording ? (
                <>
                  <View style={styles.recDot} />
                  <Text style={styles.timerText}>
                    {formatSecs(elapsed)} / {formatSecs(maxDuration)}
                  </Text>
                </>
              ) : (
                <Text style={styles.hintText}>Max {formatSecs(maxDuration)}</Text>
              )}
            </View>

            {/* Controls */}
            <View style={styles.controls}>
              {/* Cancel */}
              <Pressable
                style={styles.sideBtn}
                onPress={isRecording ? undefined : onClose}
                disabled={isRecording}
              >
                <Text style={[styles.sideBtnText, isRecording && styles.dimmed]}>✕</Text>
              </Pressable>

              {/* Record / Stop */}
              <Pressable style={styles.recordBtnOuter} onPress={() => void handleRecordPress()}>
                {isRecording ? (
                  <View style={styles.stopSquare} />
                ) : (
                  <View style={styles.recordCircle} />
                )}
              </Pressable>

              {/* Flip */}
              <Pressable
                style={styles.sideBtn}
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                disabled={isRecording}
              >
                <Text style={[styles.sideBtnText, isRecording && styles.dimmed]}>🔄</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function formatSecs(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: 4,
    backgroundColor: '#FF3B30',
  },
  timerRow: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  timerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  hintText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 32,
  },
  sideBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtnText: {
    fontSize: 24,
    color: '#fff',
  },
  dimmed: {
    opacity: 0.3,
  },
  recordBtnOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FF3B30',
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionBtn: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
