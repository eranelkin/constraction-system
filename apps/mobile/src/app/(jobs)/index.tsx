import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiRequest } from '../../lib/api-client';
import { getAccessToken, getStoredUser } from '../../lib/auth/token-storage';
import type { ListJobsResponse, JobSummary } from '@constractor/types';

export default function JobBoardScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const data = await apiRequest<ListJobsResponse>('/jobs', { token: token ?? undefined });
      setJobs(data.jobs);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load jobs');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const user = await getStoredUser();
      setRole(user?.role ?? null);
      await loadJobs();
    })();
  }, [loadJobs]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  }

  function renderItem({ item }: { item: JobSummary }) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(jobs)/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardBudget}>${item.budget.toLocaleString()}</Text>
        </View>
        <Text style={styles.cardLocation}>{item.location}</Text>
        <Text style={styles.cardApps}>
          {item.applicationCount} application{item.applicationCount !== 1 ? 's' : ''}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {role === 'client' && (
        <View style={styles.postRow}>
          <TouchableOpacity
            style={styles.postBtn}
            onPress={() => Alert.alert('Post a Job', 'Use the web app to post a new job.')}
          >
            <Text style={styles.postBtnText}>+ Post a Job</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
        contentContainerStyle={jobs.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>No open jobs yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  postRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff' },
  postBtn: { backgroundColor: '#3b82f6', borderRadius: 8, padding: 10, alignItems: 'center' },
  postBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  listContent: { padding: 12, gap: 10 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b', flex: 1, marginRight: 8 },
  cardBudget: { fontSize: 15, fontWeight: '700', color: '#16a34a' },
  cardLocation: { fontSize: 13, color: '#64748b', marginBottom: 4 },
  cardApps: { fontSize: 12, color: '#94a3b8' },
  empty: { fontSize: 15, color: '#94a3b8' },
});
