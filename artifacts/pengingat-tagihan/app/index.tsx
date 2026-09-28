import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, type Href } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BILL_CATEGORIES, type Bill, useBills } from '@/contexts/BillsContext';
import { SurfaceBackground } from '@/components/SurfaceBackground';
import { TopMenu } from '@/components/TopMenu';
import { useColors } from '@/hooks/useColors';
import { formatDateInput, formatDueLabel, formatRupiah, formatShortDate, getDaysUntilDue, getNextMonthlyDueDate, sortBills } from '@/lib/bill-format';

type Filter = 'all' | 'unpaid' | 'paid';

function BillCard({
  bill,
  onOpen,
  onMarkPaid,
  onDelete,
}: {
  bill: Bill;
  onOpen: () => void;
  onMarkPaid: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const category = BILL_CATEGORIES.find((item) => item.id === bill.category) ?? BILL_CATEGORIES[5];
  const daysUntilDue = getDaysUntilDue(bill.dueDate);
  const isOverdue = !bill.isPaid && daysUntilDue < 0;
  const paidLabel = bill.paidAt
    ? `Lunas · ${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(bill.paidAt))}`
    : 'Lunas';

  return (
    <View style={[styles.billCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${bill.title}, ${formatRupiah(bill.amount)}, ${bill.isPaid ? paidLabel : formatDueLabel(bill.dueDate)}`}
        onPress={onOpen}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <View style={styles.billTop}>
          <View style={[styles.categoryIcon, { backgroundColor: bill.isPaid ? colors.muted : colors.secondary }]}>
            <Feather name={category.icon} size={18} color={bill.isPaid ? colors.mutedForeground : colors.primary} />
          </View>
          <View style={styles.billMain}>
            <Text numberOfLines={1} style={[styles.billTitle, { color: colors.foreground }]}>
              {bill.title}
            </Text>
            <Text numberOfLines={1} style={[styles.billCategory, { color: colors.mutedForeground }]}>
            {bill.isPaid ? `${category.label} · Jatuh tempo ${formatShortDate(bill.dueDate)}` : `${category.label} · ${bill.repeat === 'once' ? 'Sekali bayar' : 'Bulanan'}`}
            </Text>
          </View>
          <Text style={[styles.amount, { color: colors.foreground }, bill.isPaid && styles.paidText]}>
            {formatRupiah(bill.amount)}
          </Text>
        </View>
      </Pressable>

      <View style={[styles.billDivider, { backgroundColor: colors.border }]} />

      <View style={styles.billBottom}>
        <View style={styles.dueTextWrap}>
          <Feather
            name={bill.isPaid ? 'check-circle' : isOverdue ? 'alert-circle' : 'calendar'}
            size={14}
            color={bill.isPaid ? colors.primary : isOverdue ? colors.destructive : colors.mutedForeground}
          />
          <Text
            style={[
              styles.dueText,
              { color: bill.isPaid ? colors.primary : isOverdue ? colors.destructive : colors.mutedForeground },
            ]}
          >
            {bill.isPaid ? paidLabel : formatDueLabel(bill.dueDate)}
          </Text>
        </View>
        {bill.remind && !bill.isPaid ? (
          <View style={[styles.reminderTag, { backgroundColor: colors.accent }]}>
            <Feather name="bell" size={12} color={colors.accentForeground} />
            <Text style={[styles.reminderTagText, { color: colors.accentForeground }]}>Pengingat</Text>
          </View>
        ) : null}
        <View style={styles.cardActions}>
          {bill.isPaid ? (
            <View accessibilityLabel="Pembayaran tercatat" style={[styles.statusButton, { borderColor: colors.action, backgroundColor: colors.action }]}>
              <Feather name="check" size={14} color={colors.actionForeground} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Konfirmasi pembayaran ${bill.title}`}
              hitSlop={10}
              onPress={onMarkPaid}
              style={({ pressed }) => [styles.statusButton, { borderColor: colors.border, backgroundColor: 'transparent' }, pressed && styles.pressed]}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Hapus ${bill.title}`}
            hitSlop={10}
            onPress={onDelete}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Feather name="trash-2" size={15} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bills, loading, error, reload, deleteBill, markPaid } = useBills();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const unpaidBills = useMemo(() => bills.filter((bill) => !bill.isPaid), [bills]);
  const outstandingTotal = useMemo(
    () => unpaidBills.reduce((total, bill) => total + bill.amount, 0),
    [unpaidBills],
  );
  const dueSoonCount = useMemo(
    () => unpaidBills.filter((bill) => {
      const days = getDaysUntilDue(bill.dueDate);
      return days >= 0 && days <= 7;
    }).length,
    [unpaidBills],
  );
  const visibleBills = useMemo(() => {
    const filtered = bills.filter((bill) =>
      filter === 'all' ? true : filter === 'unpaid' ? !bill.isPaid : bill.isPaid,
    );
    return sortBills(filtered);
  }, [bills, filter]);

  const removeBill = (bill: Bill) => {
    const message = bill.isPaid
      ? `Catatan pembayaran ${bill.title} akan dihapus permanen dari riwayat.`
      : `${bill.title} akan dihapus dan tidak berulang lagi. Riwayat pembayaran sebelumnya tetap tersimpan.`;
    const confirmDelete = () => {
      void deleteBill(bill.id).catch((cause: unknown) => {
        const errorMessage = cause instanceof Error ? cause.message : 'Tagihan belum bisa dihapus.';
        if (Platform.OS === 'web') window.alert(errorMessage);
        else Alert.alert('Belum berhasil', errorMessage);
      });
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Hapus tagihan?\n\n${message}`)) confirmDelete();
      return;
    }
    Alert.alert('Hapus tagihan?', message, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: confirmDelete },
    ]);
  };

  const changePaid = (bill: Bill) => {
    const nextDate = getNextMonthlyDueDate(bill.dueDate, bill.recurrenceDay ?? Number(bill.dueDate.slice(-2)));
    const message = bill.repeat === 'once'
      ? `${bill.title} akan disimpan di riwayat lunas. Tagihan ini tidak akan berulang.`
      : `${bill.title} akan disimpan di riwayat lunas. Tagihan berikutnya otomatis dibuat untuk ${formatDateInput(nextDate)}.`;
    const confirmPayment = () => {
      void markPaid(bill.id).catch((cause: unknown) => {
        const errorMessage = cause instanceof Error ? cause.message : 'Pembayaran belum bisa disimpan.';
        if (Platform.OS === 'web') window.alert(errorMessage);
        else Alert.alert('Belum berhasil', errorMessage);
      });
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Konfirmasi pembayaran?\n\n${message}`)) confirmPayment();
    } else {
      Alert.alert('Konfirmasi pembayaran?', message, [
        { text: 'Batal', style: 'cancel' },
        { text: 'Sudah dibayar', onPress: confirmPayment },
      ]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const dateLabel = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.topRow}>
        <View>
          <View style={styles.brandRow}>
            <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
              <Feather name="check" size={14} color={colors.primaryForeground} />
            </View>
            <Text style={[styles.brandName, { color: colors.foreground }]}>ingat</Text>
          </View>
          <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>{dateLabel}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tambah tagihan"
          onPress={() => router.push('/bill-form')}
          style={({ pressed }) => [styles.headerAddButton, { backgroundColor: colors.actionSoft }, pressed && styles.pressed]}
        >
          <Feather name="plus" size={20} color={colors.action} />
        </Pressable>
      </View>

      <Text style={[styles.pageTitle, { color: colors.foreground }]}>Tagihan kamu</Text>
      <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
        Biar semua jatuh tempo tetap terpantau.
      </Text>
      <TopMenu active="bills" />
      {__DEV__ && Platform.OS !== 'web' && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/notification-check' as Href)}>
          <Text style={{ color: colors.mutedForeground }}>Uji notifikasi perangkat</Text>
        </Pressable>
      )}

      <LinearGradient
        colors={[colors.dashboardGlass, colors.dashboardGlassDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.summaryCard, { borderColor: colors.border }]}
      >
        <View style={styles.summaryTop}>
          <View>
            <Text style={[styles.summaryEyebrow, { color: colors.primaryForeground }]}>TOTAL BELUM DIBAYAR</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.summaryAmount, { color: colors.primaryForeground }]}>
              {formatRupiah(outstandingTotal)}
            </Text>
          </View>
          <View style={[styles.summaryIcon, { borderColor: colors.primaryForeground }]}>
            <Feather name="pie-chart" size={20} color={colors.primaryForeground} />
          </View>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.primaryForeground }]} />
        <View style={styles.summaryFoot}>
          <View style={styles.summaryStat}>
            <Feather name="file-text" size={14} color={colors.primaryForeground} />
            <Text style={[styles.summaryFootText, { color: colors.primaryForeground }]}>{unpaidBills.length} tagihan aktif</Text>
          </View>
          <View style={styles.summaryStat}>
            <Feather name="clock" size={14} color={colors.primaryForeground} />
            <Text style={[styles.summaryFootText, { color: colors.primaryForeground }]}>{dueSoonCount} jatuh tempo dalam 7 hari</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.listHeading}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {filter === 'paid' ? 'Riwayat lunas' : 'Daftar tagihan'}
        </Text>
        <Text style={[styles.billCount, { color: colors.mutedForeground }]}>{bills.length}</Text>
      </View>
      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.accent }]}>
          <Feather name="alert-circle" size={14} color={colors.accentForeground} />
          <Text style={[styles.errorBannerText, { color: colors.accentForeground }]}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.filters}>
        {([
          ['all', 'Semua'],
          ['unpaid', 'Belum lunas'],
          ['paid', 'Lunas'],
        ] as const).map(([key, label]) => {
          const selected = filter === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setFilter(key)}
              style={({ pressed }) => [
                styles.filterChip,
                { backgroundColor: selected ? colors.action : colors.card, borderColor: selected ? colors.action : colors.border },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterText, { color: selected ? colors.actionForeground : colors.mutedForeground }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const emptyState = (
    <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={filter === 'paid' ? 'check-circle' : 'calendar'} size={24} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        {filter === 'paid' ? 'Belum ada riwayat lunas' : filter === 'unpaid' ? 'Semua sudah beres' : 'Belum ada tagihan'}
      </Text>
      <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
        {filter === 'paid'
          ? 'Tagihan yang sudah kamu bayar akan muncul di sini.'
          : filter === 'unpaid'
            ? 'Mantap, belum ada tagihan yang menunggu.'
            : 'Tambahkan tagihan pertama supaya tanggal jatuh temponya tidak terlewat.'}
      </Text>
      {filter === 'all' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/bill-form')}
          style={({ pressed }) => [styles.emptyAction, { backgroundColor: colors.action }, pressed && styles.pressed]}
        >
          <Feather name="plus" size={16} color={colors.actionForeground} />
          <Text style={[styles.emptyActionText, { color: colors.actionForeground }]}>Tambah tagihan</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Memuat tagihan...</Text>
      </View>
    );
  }

  if (error && bills.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={28} color={colors.destructive} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Tagihan belum bisa dibuka</Text>
        <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>{error}</Text>
        <Pressable onPress={() => void reload()} style={[styles.emptyAction, { backgroundColor: colors.action }]}>
          <Text style={[styles.emptyActionText, { color: colors.actionForeground }]}>Coba lagi</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === 'web' ? insets.top + 67 : insets.top,
        },
      ]}
    >
      <SurfaceBackground />
      <FlatList
        data={visibleBills}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BillCard
            bill={item}
            onOpen={() => router.push({ pathname: '/bill-form', params: { id: item.id } })}
            onMarkPaid={() => changePaid(item)}
            onDelete={() => removeBill(item)}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyState}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 112 },
        ]}
        ItemSeparatorComponent={() => <View style={styles.cardSpacer} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.primary} />
        }
      />
      {bills.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tambah tagihan"
          onPress={() => router.push('/bill-form')}
          style={({ pressed }) => [
            styles.floatingButton,
            { backgroundColor: colors.action, shadowColor: colors.action, bottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 18 },
            pressed && styles.pressed,
          ]}
        >
          <Feather name="plus" size={19} color={colors.actionForeground} />
          <Text style={[styles.floatingButtonText, { color: colors.actionForeground }]}>Tambah tagihan</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 14 },
  loadingText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  listContent: { paddingHorizontal: 20 },
  headerContent: { paddingBottom: 21 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandMark: { width: 22, height: 22, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: -0.7 },
  dateLabel: { marginTop: 5, fontFamily: 'Inter_500Medium', fontSize: 11, textTransform: 'capitalize' },
  headerAddButton: { width: 42, height: 42, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -1.1 },
  pageSubtitle: { marginTop: 6, marginBottom: 21, fontFamily: 'Inter_400Regular', fontSize: 14 },
  summaryCard: { marginTop: 22, borderRadius: 10, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 19, overflow: 'hidden' },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryEyebrow: { opacity: 0.75, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.1 },
  summaryAmount: { marginTop: 8, fontSize: 27, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 },
  summaryIcon: { width: 40, height: 40, borderRadius: 7, borderWidth: 1, opacity: 0.75, alignItems: 'center', justifyContent: 'center' },
  summaryDivider: { height: StyleSheet.hairlineWidth, opacity: 0.24, marginTop: 17, marginBottom: 13 },
  summaryFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  summaryStat: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  summaryFootText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28 },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  billCount: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  errorBanner: { borderRadius: 7, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  errorBannerText: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium' },
  filters: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 15 },
  filterChip: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 9, borderRadius: 6, borderWidth: 1 },
  filterText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  billCard: { borderRadius: 9, borderWidth: 1, padding: 15 },
  billTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  categoryIcon: { width: 42, height: 42, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  billMain: { flex: 1, minWidth: 0 },
  billTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  billCategory: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: 11 },
  amount: { fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: -0.25 },
  paidText: { textDecorationLine: 'line-through', opacity: 0.65 },
  billDivider: { height: StyleSheet.hairlineWidth, marginVertical: 13 },
  billBottom: { flexDirection: 'row', alignItems: 'center', minHeight: 26 },
  dueTextWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dueText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  reminderTag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 5, marginLeft: 8 },
  reminderTagText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 11, marginLeft: 'auto', paddingLeft: 8 },
  statusButton: { width: 23, height: 23, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center' },
  cardSpacer: { height: 10 },
  emptyCard: { borderRadius: 9, borderWidth: 1, padding: 23, alignItems: 'center', marginTop: 5 },
  emptyIcon: { width: 54, height: 54, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, textAlign: 'center', marginTop: 15 },
  emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7, maxWidth: 280 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 7, paddingHorizontal: 16, paddingVertical: 12, marginTop: 18 },
  emptyActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  floatingButton: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 19, height: 52, borderRadius: 8, elevation: 5, shadowOpacity: 0.16, shadowOffset: { width: 0, height: 5 }, shadowRadius: 12 },
  floatingButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  pressed: { opacity: 0.78 },
});