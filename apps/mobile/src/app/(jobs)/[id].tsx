import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiRequest } from '../../lib/api-client';
import { getAccessToken, getStoredUser } from '../../lib/auth/token-storage';
import type {
  GetJobResponse,
  ApplyToJobResponse,
  HireContractorResponse,
  JobDetail,
} from '@constractor/types';

const statusColors: Record<string, string> = {
  open: '#2563eb',
  assigned: '#d97706',
  completed: '#16a34a',
  cancelled: '#6b7280',
};

const appStatusColors: Record<string, { bg: string; text: string }> = {
  pending:  { bg: '#fef9c3', text: '#92400e' },
  accepted: { bg: '#dcfce7', text: '#15803d' },
  rejected: { bg: '#fee2e2', text: '#dc2626' },
};

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [coverNote, setCoverNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  async function loadJob() {
    try {
      const token = await getAccessToken();
      const data = await apiRequest<GetJobResponse>(`/jobs/${id}`, { token: token ?? undefined });
      setJob(data.job);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const user = await getStoredUser();
      setRole(user?.role ?? null);
      setUserId(user?.id ?? null);
      await loadJob();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleApply() {
    if (!coverNote.trim()) return;
    setApplying(true);
    try {
      const token = await getAccessToken();
      await apiRequest<ApplyToJobResponse>(`/jobs/${id}/apply`, {
        method: 'POST',
        token: token ?? undefined,
        body: { coverNote: coverNote.trim() },
      });
      setCoverNote('');
      Alert.alert('Success', 'Application submitted!');
      await loadJob();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  }

  async function handleHire(applicationId: string, contractorName: string) {
    Alert.alert('Hire Contractor', `Hire ${contractorName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Hire',
        onPress: async () => {
          try {
            const token = await getAccessToken();
            await apiRequest<HireContractorResponse>(`/jobs/${id}/hire/${applicationId}`, {
              method: 'POST',
              token: token ?? undefined,
            });
            Alert.alert('Success', `${contractorName} hired! A conversation has been started.`);
            await loadJob();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to hire');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Job not found.</Text>
      </View>
    );
  }

  const statusColor = statusColors[job.status] ?? '#6b7280';
  const myApp = role === 'contractor' ? job.applications.at(0) : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Job info */}
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{job.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{job.status}</Text>
          </View>
        </View>
        <Text style={styles.location}>{job.location}</Text>
        <Text style={styles.budget}>${job.budget.toLocaleString()}</Text>
        <Text style={styles.description}>{job.description}</Text>
      </View>

      {/* Contractor: apply section */}
      {role === 'contractor' && (
        <View style={styles.card}>
          {myApp ? (
            <>
              <Text style={styles.sectionTitle}>Your Application</Text>
              <Text style={styles.coverNoteText}>{myApp.coverNote}</Text>
              <View style={[styles.appStatusBadge, { backgroundColor: appStatusColors[myApp.status]?.bg ?? '#f1f5f9' }]}>
                <Text style={[styles.appStatusText, { color: appStatusColors[myApp.status]?.text ?? '#6b7280' }]}>
                  {myApp.status.charAt(0).toUpperCase() + myApp.status.slice(1)}
                </Text>
              </View>
            </>
          ) : job.status === 'open' ? (
            <>
              <Text style={styles.sectionTitle}>Apply</Text>
              <TextInput
                style={styles.textArea}
                value={coverNote}
                onChangeText={setCoverNote}
                placeholder="Write a short cover note…"
                multiline
                numberOfLines={4}
                maxLength={1000}
              />
              <TouchableOpacity
                style={[styles.applyBtn, (!coverNote.trim() || applying) && styles.applyBtnDisabled]}
                onPress={() => void handleApply()}
                disabled={!coverNote.trim() || applying}
              >
                <Text style={styles.applyBtnText}>{applying ? 'Applying…' : 'Apply'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.closedText}>This job is no longer accepting applications.</Text>
          )}
        </View>
      )}

      {/* Client: applications list */}
      {role === 'client' && userId && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Applications ({job.applications.length})</Text>
          {job.applications.length === 0 ? (
            <Text style={styles.emptyText}>No applications yet.</Text>
          ) : (
            job.applications.map((app) => {
              const appColors = appStatusColors[app.status] ?? { bg: '#f1f5f9', text: '#6b7280' };
              return (
                <View key={app.id} style={styles.appItem}>
                  <View style={styles.appItemHeader}>
                    <Text style={styles.contractorName}>{app.contractorName}</Text>
                    <View style={[styles.appStatusBadge, { backgroundColor: appColors.bg }]}>
                      <Text style={[styles.appStatusText, { color: appColors.text }]}>{app.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.coverNoteText}>{app.coverNote}</Text>
                  {job.status === 'open' && app.status === 'pending' && (
                    <TouchableOpacity
                      style={styles.hireBtn}
                      onPress={() => void handleHire(app.id, app.contractorName)}
                    >
                      <Text style={styles.hireBtnText}>Hire</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back to Jobs</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#dc2626' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b', flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  location: { fontSize: 14, color: '#64748b' },
  budget: { fontSize: 16, fontWeight: '700', color: '#16a34a' },
  description: { fontSize: 14, color: '#475569', lineHeight: 22 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  textArea: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 14, minHeight: 100, textAlignVertical: 'top' },
  applyBtn: { backgroundColor: '#3b82f6', borderRadius: 8, padding: 12, alignItems: 'center' },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  closedText: { fontSize: 14, color: '#94a3b8' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  appItem: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, gap: 6 },
  appItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contractorName: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  appStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  appStatusText: { fontSize: 11, fontWeight: '700' },
  coverNoteText: { fontSize: 13, color: '#475569' },
  hireBtn: { backgroundColor: '#16a34a', borderRadius: 8, padding: 8, alignItems: 'center', alignSelf: 'flex-start' },
  hireBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  backBtn: { marginTop: 8 },
  backBtnText: { color: '#3b82f6', fontSize: 14 },
});
