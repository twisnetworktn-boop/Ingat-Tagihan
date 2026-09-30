import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoPickerField, PhotoProof } from '@/components/PhotoAttachment';
import { SurfaceBackground } from '@/components/SurfaceBackground';
import { TopMenu } from '@/components/TopMenu';
import { TransactionSnapshot, type Snapshot } from '@/components/TransactionSnapshot';
import { BILL_CATEGORIES, type BillCategory } from '@/contexts/BillsContext';
import { useNotes, type Debt, type Deposit, type Routine, type RoutinePayment } from '@/contexts/NotesContext';
import { useColors } from '@/hooks/useColors';
import { formatDateInput, formatRupiah, getLocalDateString, getNextExpenseDueDate } from '@/lib/bill-format';
import type { PhotoDraft } from '@/lib/photo-attachments';

type Section = 'debt' | 'routine';
type Palette = ReturnType<typeof useColors>;

function expenseCategory(category?: BillCategory) {
  return BILL_CATEGORIES.find(item => item.id === category) ?? BILL_CATEGORIES[5];
}

function paymentSnapshot(payment: RoutinePayment): Snapshot {
  return {
    title: payment.title,
    subtitle: 'Pengeluaran lunas',
    rows: [
      { label: 'Status', value: 'Lunas' },
      { label: 'Nominal', value: formatRupiah(payment.amount) },
      { label: 'Kategori', value: expenseCategory(payment.category).label },
      ...(payment.frequency ? [{ label: 'Jenis', value: payment.frequency === 'once' ? 'Sekali bayar' : payment.frequency === 'weekly' ? 'Mingguan' : 'Bulanan' }] : []),
      { label: 'Jatuh tempo', value: formatDateInput(payment.dueDate) },
      { label: 'Dibayar', value: formatDateInput(payment.paidAt.slice(0, 10)) },
    ],
    note: payment.note,
    photoUri: payment.receiptUri,
  };
}

function debtSnapshot(debt: Debt, deposits: Deposit[]): Snapshot {
  const latest = [...deposits].sort((a, b) => b.date.localeCompare(a.date))[0];
  return {
    title: debt.person,
    subtitle: 'Hutang lunas',
    rows: [
      { label: 'Status', value: 'Lunas' },
      { label: 'Arah', value: debt.direction === 'owe' ? 'Saya berutang' : 'Mereka berutang' },
      { label: 'Total hutang', value: formatRupiah(debt.amount) },
      { label: 'Jatuh tempo', value: formatDateInput(debt.dueDate) },
      ...(latest ? [{ label: 'Setoran terakhir', value: formatDateInput(latest.date) }] : []),
      ...[...deposits].sort((a, b) => a.date.localeCompare(b.date)).map((deposit, index) => ({
        label: `Setoran ${index + 1} · ${formatDateInput(deposit.date)}`,
        value: `${formatRupiah(deposit.amount)}${deposit.note ? ` · ${deposit.note}` : ''}`,
      })),
    ],
    note: debt.note,
    photoUri: debt.photoUri,
  };
}

function confirmAction(title: string, message: string, action: string, destructive: boolean, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Batal', style: 'cancel' },
      { text: action, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
}

function showError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Perubahan belum bisa disimpan. Coba lagi.';
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Belum berhasil', message);
}

function SmallAction({ icon, label, onPress, colors, danger = false }: {
  icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; colors: Palette; danger?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={5}
      style={({ pressed }) => [styles.smallAction, { backgroundColor: danger ? colors.accent : colors.actionSoft }, pressed && styles.pressed]}>
      <Feather name={icon} size={14} color={danger ? colors.destructive : colors.action} />
    </Pressable>
  );
}

function DebtCard({ debt, deposits, colors, onEdit, onDelete, onAddDeposit, onEditDeposit, onDeleteDeposit, onSnapshot }: {
  debt: Debt; deposits: Deposit[]; colors: Palette; onEdit: () => void; onDelete: () => void; onAddDeposit: () => void; onSnapshot: () => void;
  onEditDeposit: (deposit: Deposit) => void; onDeleteDeposit: (deposit: Deposit) => void;
}) {
  const paid = deposits.reduce((total, deposit) => total + deposit.amount, 0);
  const remaining = Math.max(0, debt.amount - paid);
  const settled = remaining === 0;
  const progress = debt.amount > 0 ? Math.min(100, paid / debt.amount * 100) : 0;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <Pressable accessibilityRole="button" accessibilityLabel={settled ? `Lihat snapshot hutang lunas ${debt.person}` : `Ubah utang ${debt.person}`} onPress={settled ? onSnapshot : onEdit} style={styles.cardMainTouch}>
          <View style={[styles.cardIcon, { backgroundColor: settled ? colors.actionSoft : colors.secondary }]}>
            <Feather name={settled ? 'check' : debt.direction === 'owe' ? 'arrow-up-right' : 'arrow-down-left'} size={19} color={settled ? colors.action : colors.primary} />
          </View>
          <View style={styles.cardMain}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{debt.person}</Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{debt.direction === 'owe' ? 'Saya berutang' : 'Mereka berutang'} · {settled ? 'Lunas' : `Jatuh tempo ${formatDateInput(debt.dueDate)}`}</Text>
          </View>
          {settled && <Feather name="chevron-right" size={17} color={colors.action} />}
        </Pressable>
        <SmallAction icon="edit-2" label={`Ubah utang ${debt.person}`} onPress={onEdit} colors={colors} />
        <SmallAction icon="trash-2" label={`Hapus utang ${debt.person}`} onPress={onDelete} colors={colors} danger />
      </View>
      <View style={styles.balanceRow}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{settled ? 'TERBAYAR PENUH' : 'SISA SALDO'}</Text>
          <Text style={[styles.balance, { color: settled ? colors.action : colors.foreground }]}>{formatRupiah(settled ? debt.amount : remaining)}</Text>
        </View>
        <Text style={[styles.total, { color: colors.mutedForeground }]}>dari {formatRupiah(debt.amount)}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.action, width: `${progress}%` }]} />
      </View>
      {debt.note ? <Text style={[styles.note, { color: colors.mutedForeground }]}>{debt.note}</Text> : null}
      <PhotoProof uri={debt.photoUri} label="Lihat bukti hutang" />
      {settled && (
        <Pressable accessibilityRole="button" onPress={onSnapshot} style={styles.snapshotLink}>
          <Feather name="file-text" size={14} color={colors.action} />
          <Text style={[styles.snapshotLinkText, { color: colors.action }]}>Lihat snapshot lunas</Text>
        </Pressable>
      )}
      <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
      <View style={styles.depositHeading}>
        <Text style={[styles.depositHeadingText, { color: colors.foreground }]}>Setoran <Text style={{ color: colors.mutedForeground }}>({deposits.length})</Text></Text>
        {!settled && (
          <Pressable accessibilityRole="button" onPress={onAddDeposit} style={styles.inlineAdd}>
            <Feather name="plus" size={15} color={colors.action} />
            <Text style={[styles.inlineAddText, { color: colors.action }]}>Catat setoran</Text>
          </Pressable>
        )}
      </View>
      {deposits.length === 0 ? (
        <Text style={[styles.depositEmpty, { color: colors.mutedForeground }]}>Belum ada setoran. Saldo akan berkurang saat kamu mencatatnya.</Text>
      ) : [...deposits].sort((a, b) => b.date.localeCompare(a.date)).map(deposit => (
        <View key={deposit.id} style={[styles.depositLine, { borderTopColor: colors.border }]}>
          <View style={[styles.depositDot, { backgroundColor: colors.actionSoft }]}><Feather name="arrow-down-left" size={13} color={colors.action} /></View>
          <View style={styles.depositCopy}>
            <Text style={[styles.depositAmount, { color: colors.foreground }]}>{formatRupiah(deposit.amount)}</Text>
            <Text style={[styles.depositMeta, { color: colors.mutedForeground }]}>{formatDateInput(deposit.date)}{deposit.note ? ` · ${deposit.note}` : ''}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ubah setoran ${formatRupiah(deposit.amount)}`} onPress={() => onEditDeposit(deposit)} hitSlop={8} style={styles.rowIcon}><Feather name="edit-2" size={14} color={colors.mutedForeground} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Hapus setoran ${formatRupiah(deposit.amount)}`} onPress={() => onDeleteDeposit(deposit)} hitSlop={8} style={styles.rowIcon}><Feather name="trash-2" size={14} color={colors.destructive} /></Pressable>
        </View>
      ))}
    </View>
  );
}

function PaymentHistoryRow({ payment, colors, onOpen, onUndo, showTitle = false }: {
  payment: RoutinePayment; colors: Palette; onOpen: () => void; onUndo?: () => void; showTitle?: boolean;
}) {
  return (
    <View style={[styles.depositLine, { borderTopColor: colors.border }]}>
      <View style={[styles.depositDot, { backgroundColor: colors.actionSoft }]}><Feather name="check" size={13} color={colors.action} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Lihat snapshot pembayaran ${payment.title}`} onPress={onOpen} style={styles.depositCopy}>
        <Text style={[styles.depositAmount, { color: colors.foreground }]}>{showTitle ? `${payment.title} · ` : ''}{formatRupiah(payment.amount)}</Text>
        <Text style={[styles.depositMeta, { color: colors.mutedForeground }]}>{expenseCategory(payment.category).label} · Jatuh tempo {formatDateInput(payment.dueDate)} · Dibayar {formatDateInput(payment.paidAt.slice(0, 10))}{payment.receiptUri ? ' · Ada nota' : ''}</Text>
      </Pressable>
      {onUndo ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Batalkan pembayaran ${payment.title}`} onPress={onUndo} hitSlop={8} style={styles.rowIcon}>
          <Feather name="rotate-ccw" size={14} color={colors.action} />
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Buka pembayaran ${payment.title}`} onPress={onOpen} hitSlop={8} style={styles.rowIcon}>
        <Feather name="chevron-right" size={17} color={colors.action} />
      </Pressable>
    </View>
  );
}

function RoutineCard({ routine, payments, colors, onEdit, onDelete, onPay, onOpenPayment, onUndoPayment }: {
  routine: Routine; payments: RoutinePayment[]; colors: Palette; onEdit: () => void; onDelete: () => void; onPay: () => void;
  onOpenPayment: (payment: RoutinePayment) => void; onUndoPayment: (payment: RoutinePayment) => void;
}) {
  const category = expenseCategory(routine.category);
  const due = routine.dueDate < getLocalDateString(new Date())
    ? 'Lewat jatuh tempo'
    : `${routine.frequency === 'once' ? 'Jatuh tempo' : 'Berikutnya'} ${formatDateInput(routine.dueDate)}`;
  const sortedPayments = [...payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, { backgroundColor: colors.secondary }]}><Feather name={category.icon} size={18} color={colors.primary} /></View>
        <View style={styles.cardMain}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{routine.title}</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{category.label} · {routine.frequency === 'once' ? 'Sekali bayar' : `Setiap ${routine.frequency === 'weekly' ? 'minggu' : 'bulan'}`}</Text>
        </View>
        <SmallAction icon="edit-2" label={`Ubah ${routine.title}`} onPress={onEdit} colors={colors} />
        <SmallAction icon="trash-2" label={`Hapus ${routine.title}`} onPress={onDelete} colors={colors} danger />
      </View>
      <View style={styles.balanceRow}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{routine.frequency === 'once' ? 'NOMINAL PENGELUARAN' : 'PER PERIODE'}</Text>
          <Text style={[styles.balance, { color: colors.foreground }]}>{formatRupiah(routine.amount)}</Text>
        </View>
        {routine.remind && <Feather name="bell" size={15} color={colors.primary} />}
      </View>
      <View style={styles.dueRow}><Feather name="calendar" size={13} color={colors.primary} /><Text style={[styles.dueText, { color: colors.primary }]}>{due}</Text></View>
      {routine.note ? <Text style={[styles.note, { color: colors.mutedForeground }]}>{routine.note}</Text> : null}
      <Pressable accessibilityRole="button" onPress={onPay} style={({ pressed }) => [styles.payButton, { backgroundColor: colors.action }, pressed && styles.pressed]}>
        <Feather name="check" size={16} color={colors.actionForeground} />
        <Text style={[styles.payText, { color: colors.actionForeground }]}>Sudah dibayar</Text>
      </Pressable>
      <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
      <Text style={[styles.depositHeadingText, { color: colors.foreground }]}>Riwayat pembayaran <Text style={{ color: colors.mutedForeground }}>({payments.length})</Text></Text>
      {payments.length === 0 ? (
        <Text style={[styles.depositEmpty, { color: colors.mutedForeground }]}>Belum ada pembayaran. Konfirmasi setelah pengeluaran ini dibayar.</Text>
      ) : sortedPayments.map((payment, index) => (
        <PaymentHistoryRow
          key={payment.id}
          payment={payment}
          colors={colors}
          onOpen={() => onOpenPayment(payment)}
          onUndo={index === 0 ? () => onUndoPayment(payment) : undefined}
        />
      ))}
    </View>
  );
}

export default function CatatanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { debts, deposits, routines, routinePayments, loading, error, reload, deleteDebt, deleteDeposit, deleteRoutine, payRoutine, undoRoutinePayment } = useNotes();
  const [section, setSection] = useState<Section>('debt');
  const [refreshing, setRefreshing] = useState(false);
  const [payingRoutine, setPayingRoutine] = useState<Routine | null>(null);
  const [receiptDraft, setReceiptDraft] = useState<PhotoDraft | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const groups = useMemo(() => ({
    owe: debts.filter(x => x.direction === 'owe').sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    owed: debts.filter(x => x.direction === 'owed').sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  }), [debts]);
  const balance = (debt: Debt) => Math.max(0, debt.amount - deposits.filter(x => x.debtId === debt.id).reduce((sum, x) => sum + x.amount, 0));
  const oweTotal = groups.owe.reduce((sum, debt) => sum + balance(debt), 0);
  const owedTotal = groups.owed.reduce((sum, debt) => sum + balance(debt), 0);
  const openCount = debts.filter(x => balance(x) > 0).length;
  const openDebts = debts.filter(x => balance(x) > 0);
  const action = (task: () => Promise<void>) => { void task().catch(showError); };
  const removeDebt = (debt: Debt) => confirmAction('Hapus catatan utang?', `${debt.person} dan semua setoran yang terkait akan dihapus permanen.`, 'Hapus utang', true, () => action(() => deleteDebt(debt.id)));
  const removeDeposit = (deposit: Deposit) => confirmAction('Hapus setoran?', `${formatRupiah(deposit.amount)} akan dihapus dan saldo utang kembali bertambah.`, 'Hapus setoran', true, () => action(() => deleteDeposit(deposit.id)));
  const removeRoutine = (routine: Routine) => confirmAction('Hapus pengeluaran?', `${routine.title} akan dihapus dari daftar. Riwayat pembayaran sebelumnya tetap tersimpan.`, 'Hapus', true, () => action(() => deleteRoutine(routine.id)));
  const markRoutine = (routine: Routine) => {
    setReceiptDraft(null);
    setPayingRoutine(routine);
  };
  const confirmPayment = async () => {
    if (!payingRoutine || paymentSaving) return;
    setPaymentSaving(true);
    try {
      await payRoutine(payingRoutine.id, receiptDraft ?? undefined);
      setPayingRoutine(null);
      setReceiptDraft(null);
    } catch (cause) {
      showError(cause);
    } finally {
      setPaymentSaving(false);
    }
  };
  const nextPaymentDate = payingRoutine ? getNextExpenseDueDate(payingRoutine.frequency, payingRoutine.dueDate, payingRoutine.anchorDay) : null;
  const undoRoutine = (payment: RoutinePayment) => {
    confirmAction(
      'Batalkan pembayaran?',
      `${formatRupiah(payment.amount)} untuk ${payment.title} akan dikembalikan menjadi pengeluaran aktif. Jika ada periode berikutnya yang dibuat otomatis, periode itu akan diganti dengan periode yang dibatalkan.`,
      'Batalkan pembayaran',
      false,
      () => action(() => undoRoutinePayment(payment.id)),
    );
  };

  const navigate = (type: 'debt' | 'deposit' | 'routine', id?: string, debtId?: string) => router.push({ pathname: '/catatan-form', params: { type, ...(id ? { id } : {}), ...(debtId ? { debtId } : {}) } });
  const refresh = async () => { setRefreshing(true); try { await reload(); } catch (cause) { showError(cause); } finally { setRefreshing(false); } };
  const empty = section === 'debt' ? debts.length === 0 : routines.length === 0;

  const renderGroup = (title: string, subtitle: string, list: Debt[]) => (
    <View style={styles.group}>
      <View style={styles.groupHeading}>
        <View><Text style={[styles.groupTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.groupSub, { color: colors.mutedForeground }]}>{subtitle}</Text></View>
        <Text style={[styles.groupCount, { color: colors.primary }]}>{list.length}</Text>
      </View>
      {list.length === 0 ? (
        <View style={[styles.quietRow, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.quietText, { color: colors.mutedForeground }]}>Belum ada catatan di bagian ini.</Text></View>
      ) : list.map(debt => (
        <DebtCard key={debt.id} debt={debt} deposits={deposits.filter(x => x.debtId === debt.id)} colors={colors}
          onEdit={() => navigate('debt', debt.id)} onDelete={() => removeDebt(debt)} onAddDeposit={() => navigate('deposit', undefined, debt.id)}
          onSnapshot={() => setSnapshot(debtSnapshot(debt, deposits.filter(x => x.debtId === debt.id)))}
          onEditDeposit={deposit => navigate('deposit', deposit.id)} onDeleteDeposit={removeDeposit} />
      ))}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? insets.top + 67 : insets.top }]}>
      <SurfaceBackground />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
        contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 95 }]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Ayo Catat</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Utang dan pengeluaran rutin, tersimpan rapi di sini.</Text>
        <TopMenu active="notes" />

        <LinearGradient colors={[colors.dashboardGlass, colors.dashboardGlassDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.summary, { borderColor: colors.border }]}>
          <View style={styles.summaryHeader}><Text style={[styles.summaryEyebrow, { color: colors.primaryForeground }]}>SEKILAS CATATAN</Text><Feather name="book-open" size={20} color={colors.primaryForeground} /></View>
          <View style={styles.summaryColumns}>
            <View style={styles.summaryColumn}><Text style={[styles.summaryLabel, { color: colors.primaryForeground }]}>Perlu kubayar</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.summaryNumber, { color: colors.primaryForeground }]}>{formatRupiah(oweTotal)}</Text></View>
            <View style={[styles.summaryLine, { backgroundColor: colors.primaryForeground }]} />
            <View style={styles.summaryColumn}><Text style={[styles.summaryLabel, { color: colors.primaryForeground }]}>Perlu kuterima</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.summaryNumber, { color: colors.primaryForeground }]}>{formatRupiah(owedTotal)}</Text></View>
          </View>
          <Text style={[styles.summaryFoot, { color: colors.primaryForeground }]}>{openCount} utang berjalan · {routines.length} pengeluaran berjalan</Text>
        </LinearGradient>

        <View style={styles.sectionTabs}>
          {([['debt', 'Hutang', 'users'], ['routine', 'Biaya rutin', 'repeat']] as const).map(([key, label, icon]) => (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: section === key }} onPress={() => setSection(key)}
              style={[styles.sectionTab, { backgroundColor: section === key ? colors.action : colors.card, borderColor: section === key ? colors.action : colors.border }]}>
              <Feather name={icon} size={14} color={section === key ? colors.actionForeground : colors.mutedForeground} />
              <Text numberOfLines={1} style={[styles.sectionTabText, { color: section === key ? colors.actionForeground : colors.mutedForeground }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {error && (
          <View style={[styles.error, { backgroundColor: colors.accent }]}>
            <Feather name="alert-circle" size={16} color={colors.accentForeground} />
            <Text style={[styles.errorText, { color: colors.accentForeground }]}>{error}</Text>
            <Pressable onPress={() => void reload()} accessibilityRole="button"><Text style={[styles.retry, { color: colors.accentForeground }]}>Coba lagi</Text></Pressable>
          </View>
        )}
        {loading && debts.length === 0 && deposits.length === 0 && routines.length === 0 ? (
          <View style={styles.skeletons}>
            <View style={[styles.skeletonTitle, { backgroundColor: colors.secondary }]} />
            <View style={[styles.skeletonCard, { backgroundColor: colors.secondary }]} />
            <View style={[styles.skeletonCard, { backgroundColor: colors.secondary }]} />
          </View>
        ) : error && debts.length === 0 && deposits.length === 0 && routines.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="alert-circle" size={25} color={colors.destructive} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Catatan belum bisa dibuka</Text>
            <Pressable onPress={() => void reload()} style={[styles.emptyButton, { backgroundColor: colors.action }]}><Text style={[styles.emptyButtonText, { color: colors.actionForeground }]}>Coba lagi</Text></Pressable>
          </View>
        ) : empty ? (
          <>
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}><Feather name={section === 'debt' ? 'book-open' : 'repeat'} size={25} color={colors.primary} /></View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{section === 'debt' ? 'Mulai dari satu catatan' : 'Belum ada pengeluaran'}</Text>
              <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>{section === 'debt' ? 'Catat siapa dan berapa, lalu kurangi saldonya setiap kali ada setoran.' : 'Catat pengeluaran sekali bayar atau yang berulang tiap minggu atau bulan. Riwayat bayar akan tersimpan.'}</Text>
              <Pressable onPress={() => navigate(section)} style={[styles.emptyButton, { backgroundColor: colors.action }]}>
                <Feather name="plus" size={16} color={colors.actionForeground} /><Text style={[styles.emptyButtonText, { color: colors.actionForeground }]}>Tambah {section === 'debt' ? 'hutang' : 'pengeluaran'}</Text>
              </Pressable>
            </View>
            {section === 'routine' && routinePayments.length > 0 && (
              <View style={[styles.archive, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 18 }]}>
                <Text style={[styles.depositHeadingText, { color: colors.foreground }]}>Riwayat pembayaran tersimpan</Text>
                {[...routinePayments].sort((a, b) => b.paidAt.localeCompare(a.paidAt)).map(payment => (
                  <PaymentHistoryRow
                    key={payment.id}
                    payment={payment}
                    colors={colors}
                    showTitle
                    onOpen={() => setSnapshot(paymentSnapshot(payment))}
                    onUndo={!routinePayments.some(other => other.routineId === payment.routineId && other.paidAt > payment.paidAt) ? () => undoRoutine(payment) : undefined}
                  />
                ))}
              </View>
            )}
          </>
        ) : section === 'debt' ? (
          <>
            {renderGroup('Saya berutang', 'Yang perlu kubayar', groups.owe)}
            {renderGroup('Mereka berutang', 'Yang perlu kuterima', groups.owed)}
            {openDebts.length > 0 && (
              <Pressable onPress={() => navigate('deposit')} style={[styles.secondaryAction, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="plus" size={16} color={colors.action} /><Text style={[styles.secondaryActionText, { color: colors.action }]}>Catat setoran untuk utang</Text>
              </Pressable>
            )}
          </>
        ) : (
          <View style={styles.group}>
            <View style={styles.groupHeading}><View><Text style={[styles.groupTitle, { color: colors.foreground }]}>Pengeluaran berjalan</Text><Text style={[styles.groupSub, { color: colors.mutedForeground }]}>Konfirmasi saat sudah dibayar</Text></View><Text style={[styles.groupCount, { color: colors.primary }]}>{routines.length}</Text></View>
            {[...routines].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(routine => (
              <RoutineCard key={routine.id} routine={routine} payments={routinePayments.filter(x => x.routineId === routine.id)} colors={colors}
                onEdit={() => navigate('routine', routine.id)} onDelete={() => removeRoutine(routine)} onPay={() => markRoutine(routine)}
                onOpenPayment={payment => setSnapshot(paymentSnapshot(payment))} onUndoPayment={undoRoutine} />
            ))}
            {routinePayments.filter(payment => !routines.some(routine => routine.id === payment.routineId)).length > 0 && (
              <View style={[styles.archive, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.depositHeadingText, { color: colors.foreground }]}>Riwayat pengeluaran selesai</Text>
                {routinePayments.filter(payment => !routines.some(routine => routine.id === payment.routineId)).sort((a, b) => b.paidAt.localeCompare(a.paidAt)).map(payment => (
                  <PaymentHistoryRow
                    key={payment.id}
                    payment={payment}
                    colors={colors}
                    showTitle
                    onOpen={() => setSnapshot(paymentSnapshot(payment))}
                    onUndo={!routinePayments.some(other => other.routineId === payment.routineId && other.paidAt > payment.paidAt) ? () => undoRoutine(payment) : undefined}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
      {!loading && !(error && debts.length === 0 && deposits.length === 0 && routines.length === 0) && !empty && (
        <Pressable accessibilityRole="button" accessibilityLabel={section === 'debt' ? 'Tambah hutang' : 'Tambah biaya rutin'} onPress={() => navigate(section)}
          style={({ pressed }) => [styles.fab, { backgroundColor: colors.action, bottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 18 }, pressed && styles.pressed]}>
          <Feather name="plus" size={19} color={colors.actionForeground} /><Text style={[styles.fabText, { color: colors.actionForeground }]}>Tambah {section === 'debt' ? 'hutang' : 'rutin'}</Text>
        </Pressable>
      )}
      <Modal visible={Boolean(payingRoutine)} transparent animationType="fade" onRequestClose={() => { if (!paymentSaving) setPayingRoutine(null); }}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Konfirmasi pembayaran</Text>
            <Text style={[styles.modalCopy, { color: colors.mutedForeground }]}>
              {payingRoutine ? `${formatRupiah(payingRoutine.amount)} untuk ${payingRoutine.title} akan masuk riwayat. ${nextPaymentDate ? `Jatuh tempo berikutnya ${formatDateInput(nextPaymentDate)}.` : 'Pengeluaran ini selesai dan tidak akan dibuat ulang.'}` : ''}
            </Text>
            <PhotoPickerField label="Foto/nota pembayaran" uri={receiptDraft?.uri} onChange={setReceiptDraft} disabled={paymentSaving} />
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Batal pembayaran" disabled={paymentSaving} onPress={() => setPayingRoutine(null)}
                style={[styles.modalButton, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.modalButtonText, { color: colors.foreground }]}>Batal</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Konfirmasi sudah dibayar" testID="confirm-expense-payment" disabled={paymentSaving} onPress={() => void confirmPayment()}
                style={[styles.modalButton, { backgroundColor: colors.action, opacity: paymentSaving ? 0.6 : 1 }]}>
                <Text style={[styles.modalButtonText, { color: colors.actionForeground }]}>{paymentSaving ? 'Menyimpan...' : 'Sudah dibayar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <TransactionSnapshot snapshot={snapshot} onClose={() => setSnapshot(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingHorizontal: 20 }, pressed: { opacity: 0.72 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -1.1 }, subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 21 },
  summary: { marginTop: 21, padding: 20, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, summaryEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.1, opacity: 0.76 },
  summaryColumns: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 14 }, summaryColumn: { flex: 1, minWidth: 0 },
  summaryLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, opacity: 0.8 }, summaryNumber: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.6, marginTop: 5 },
  summaryLine: { width: StyleSheet.hairlineWidth, height: 42, opacity: 0.4 }, summaryFoot: { fontFamily: 'Inter_500Medium', fontSize: 11, opacity: 0.78, marginTop: 19, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.25)' },
  sectionTabs: { flexDirection: 'row', gap: 6, marginTop: 26, marginBottom: 18 }, sectionTab: { flex: 1, minWidth: 0, minHeight: 43, borderWidth: 1, borderRadius: 7, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingHorizontal: 3 },
  sectionTabText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 }, group: { gap: 10, marginBottom: 22 }, groupHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 3 },
  groupTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: -0.4 }, groupSub: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, groupCount: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 9, padding: 15 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardMainTouch: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardIcon: { height: 39, width: 39, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }, cardMain: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 }, cardSub: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 3 },
  smallAction: { width: 29, height: 29, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18, gap: 8 }, eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.9 },
  balance: { fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: -0.5, marginTop: 4 }, total: { fontFamily: 'Inter_400Regular', fontSize: 10, paddingBottom: 3 },
  progressTrack: { height: 5, borderRadius: 3, marginTop: 13, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 3 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 12 },
  snapshotLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, minHeight: 30 },
  snapshotLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  cardDivider: { height: StyleSheet.hairlineWidth, marginVertical: 15 }, depositHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  depositHeadingText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, inlineAdd: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  inlineAddText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 }, depositEmpty: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 11 },
  depositLine: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 11, marginTop: 11, borderTopWidth: StyleSheet.hairlineWidth },
  depositDot: { height: 25, width: 25, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, depositCopy: { flex: 1, minWidth: 0 },
  depositAmount: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, depositMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 3 },
  rowIcon: { width: 25, height: 29, alignItems: 'center', justifyContent: 'center' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }, dueText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  payButton: { height: 39, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16 }, payText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  quietRow: { borderWidth: 1, borderRadius: 8, padding: 17 }, quietText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  secondaryAction: { height: 46, borderWidth: 1, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 15 },
  secondaryActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  archive: { borderWidth: 1, borderRadius: 9, padding: 16, marginTop: 6 },
  empty: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 22, paddingVertical: 30, alignItems: 'center', marginTop: 5 },
  emptyIcon: { height: 55, width: 55, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, textAlign: 'center', marginTop: 15 }, emptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  emptyButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 7, paddingHorizontal: 16, paddingVertical: 12, marginTop: 19 },
  emptyButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 7, padding: 11, marginBottom: 13 }, errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11 }, retry: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  skeletons: { gap: 12 }, skeletonTitle: { height: 22, width: 150, borderRadius: 5 }, skeletonCard: { height: 175, borderRadius: 9 },
  fab: { position: 'absolute', alignSelf: 'center', height: 52, borderRadius: 8, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 5 },
  fabText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 9, 30, 0.55)', justifyContent: 'center', paddingHorizontal: 20 },
  modalCard: { borderWidth: 1, borderRadius: 11, padding: 20, gap: 16 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  modalCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20 },
  modalActions: { flexDirection: 'row', gap: 9 },
  modalButton: { flex: 1, minHeight: 45, borderRadius: 7, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  modalButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});