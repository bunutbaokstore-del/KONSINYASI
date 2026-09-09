import { AppIcon } from "@/components/ui/app-icon";
import { MitraFinanceSummary, useMitraFinanceStatus } from "@/components/mitra-finance-summary";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useMitraFinance } from "@/lib/mitra-finance";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function FinanceScreen() {
  const colors = useColors();
  const summary = useMitraFinance();
  const { status, retry } = useMitraFinanceStatus();

  return (
    <ScreenContainer className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>MITRA UMKM</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Keuangan</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Ringkasan nilai stok, estimasi pendapatan, dan capaian produksi Anda.</Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}18` }]}>
            <AppIcon name="wallet" size={25} color={colors.primary} />
          </View>
        </View>
        <MitraFinanceSummary summary={summary} status={status} onRetry={retry} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 14, paddingBottom: 28 },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 7 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 8, paddingRight: 12 },
  headerIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 },
});