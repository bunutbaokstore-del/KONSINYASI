import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

type Notification = { id: string; notificationType: string; title: string; body: string; isRead: boolean; createdAt: string; requestId: string | null };

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const query = trpc.notifications.list.useQuery();
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => void query.refetch() });
  const notifications = (query.data ?? []) as Notification[];

  return (
    <ScreenContainer className="px-5">
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} colors={[colors.primary]} tintColor={colors.primary} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<View><View style={styles.headerRow}><Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="arrow-back" size={20} color={colors.foreground} /></Pressable><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.primary }]}>KONSINYASI</Text><Text style={[styles.title, { color: colors.foreground }]}>Notifikasi</Text></View><AppIcon name="verified" size={22} color={colors.primary} /></View><Text style={[styles.subtitle, { color: colors.muted }]}>Informasi terbaru tentang pengajuan supplier Anda.</Text>{query.error ? <Text style={[styles.errorText, { color: colors.error }]}>{query.error.message}</Text> : null}</View>}
        ListEmptyComponent={query.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={[styles.emptyText, { color: colors.muted }]}>Memuat notifikasi…</Text></View> : <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Belum ada notifikasi</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Status pengajuan yang diproses Admin akan tampil di sini.</Text></View>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.isRead ? "Sudah dibaca" : "Belum dibaca"}`} onPress={() => { if (!item.isRead) markRead.mutate({ notificationId: item.id }); }} style={({ pressed }) => [styles.card, { backgroundColor: item.isRead ? colors.surface : `${colors.primary}10`, borderColor: item.isRead ? colors.border : `${colors.primary}55` }, pressed && styles.pressed]}><View style={styles.cardTop}><Text style={[styles.titleText, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.date, { color: colors.muted }]}>{new Date(item.createdAt).toLocaleDateString("id-ID")}</Text></View><Text style={[styles.body, { color: colors.muted }]}>{item.body}</Text>{!item.isRead ? <Text style={[styles.unread, { color: colors.primary }]}>Belum dibaca</Text> : null}</Pressable>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 },
  backButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 26, fontWeight: "800", marginTop: 2 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 14, marginBottom: 18 },
  errorText: { fontSize: 13, marginBottom: 14 },
  center: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13, lineHeight: 19 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12, gap: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  titleText: { flex: 1, fontSize: 15, fontWeight: "800" },
  date: { fontSize: 11 },
  body: { fontSize: 13, lineHeight: 19 },
  unread: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
