import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PhotoPickerField } from '@/components/PhotoAttachment';
import { SurfaceBackground } from '@/components/SurfaceBackground';
import { BILL_CATEGORIES, ensureReminderPermission, type BillCategory } from '@/contexts/BillsContext';
import { useNotes, type Debt, type Routine } from '@/contexts/NotesContext';
import { useColors } from '@/hooks/useColors';
import { formatDateInput, formatRupiah, formatRupiahInput, getLocalDateString, isValidBillDate, normalizeRupiahInput } from '@/lib/bill-format';
import type { PhotoDraft } from '@/lib/photo-attachments';

type RecordType = 'debt' | 'deposit' | 'routine';

export default function CatatanFormScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string; id?: string; debtId?: string }>();
  const type: RecordType = params.type === 'deposit' || params.type === 'routine' ? params.type : 'debt';
  const { debts, deposits, routines, loading, saveDebt, saveDeposit, saveRoutine } = useNotes();
  const existingDebt = useMemo(() => type === 'debt' ? debts.find(x => x.id === params.id) : undefined, [debts, params.id, type]);
  const existingDeposit = useMemo(() => type === 'deposit' ? deposits.find(x => x.id === params.id) : undefined, [deposits, params.id, type]);
  const existingRoutine = useMemo(() => type === 'routine' ? routines.find(x => x.id === params.id) : undefined, [routines, params.id, type]);
  const initialized = useRef<string | null>(null);
  const [direction, setDirection] = useState<Debt['direction']>('owe');
  const [person, setPerson] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<BillCategory>('other');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(getLocalDateString(new Date()));
  const [note, setNote] = useState('');
  const [photoChange, setPhotoChange] = useState<PhotoDraft | null | undefined>(undefined);
  const [debtId, setDebtId] = useState(params.debtId ?? '');
  const [frequency, setFrequency] = useState<Routine['frequency']>('monthly');
  const [repeatFrequency, setRepeatFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const [remind, setRemind] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id || loading || initialized.current === `${type}:${params.id}`) return;
    const record = type === 'debt' ? existingDebt : type === 'deposit' ? existingDeposit : existingRoutine;
    if (!record) return;
    initialized.current = `${type}:${params.id}`;
    setAmount(String(record.amount));
    setNote(record.note);
    if (type === 'debt' && existingDebt) {
      setPhotoChange(undefined);
      setPerson(existingDebt.person);
      setDirection(existingDebt.direction);
      setDueDate(existingDebt.dueDate);
      setRemind(existingDebt.remind);
    } else if (type === 'deposit' && existingDeposit) {
      setDebtId(existingDeposit.debtId);
      setDueDate(existingDeposit.date);
    } else if (type === 'routine' && existingRoutine) {
      setTitle(existingRoutine.title);
      setCategory(existingRoutine.category ?? 'other');
      setDueDate(existingRoutine.dueDate);
      setFrequency(existingRoutine.frequency);
      if (existingRoutine.frequency !== 'once') setRepeatFrequency(existingRoutine.frequency);
      setRemind(existingRoutine.remind);
    }
  }, [params.id, type, loading, existingDebt, existingDeposit, existingRoutine]);

  const openDebts = debts.filter(debt => {
    const paid = deposits.filter(x => x.debtId === debt.id && x.id !== existingDeposit?.id).reduce((sum, x) => sum + x.amount, 0);
    return debt.amount > paid && (debt.amount > deposits.filter(x => x.debtId === debt.id).reduce((sum, x) => sum + x.amount, 0) || debt.id === existingDeposit?.debtId);
  });
  const selectedDebt = debts.find(x => x.id === debtId);
  const available = selectedDebt ? selectedDebt.amount - deposits.filter(x => x.debtId === debtId && x.id !== existingDeposit?.id).reduce((sum, x) => sum + x.amount, 0) : 0;
  const amountValue = Number(amount);
  const amountValid = Number.isSafeInteger(amountValue) && amountValue > 0;
  const dateLabel = type === 'deposit' ? 'Tanggal setoran' : 'Jatuh tempo';
  const isEditing = Boolean(params.id);
  const heading = type === 'debt' ? 'utang' : type === 'deposit' ? 'setoran' : 'pengeluaran';

  const toggleReminder = async (value: boolean) => {
    setFormError(null);
    if (!value) { setRemind(false); return; }
    if (Platform.OS === 'web') {
      setRemind(false);
      setFormError('Pengingat hanya tersedia di aplikasi ponsel.');
      return;
    }
    try {
      const permission = await ensureReminderPermission();
      if (permission.granted) { setRemind(true); return; }
      setRemind(false);
      if (permission.status === 'denied' && !permission.canAskAgain) {
        Alert.alert('Izin notifikasi nonaktif', 'Aktifkan notifikasi di pengaturan perangkat untuk memakai pengingat.', [
          { text: 'Nanti', style: 'cancel' },
          { text: 'Buka pengaturan', onPress: () => { void Linking.openSettings().catch(() => setFormError('Pengaturan belum bisa dibuka.')); } },
        ]);
      } else setFormError('Izin notifikasi belum diberikan. Catatan tetap dapat disimpan tanpa pengingat.');
    } catch {
      setFormError('Izin notifikasi belum bisa diperiksa.');
    }
  };

  const submit = async () => {
    setFormError(null);
    if (params.id && !loading && !(existingDebt || existingDeposit || existingRoutine)) {
      setFormError('Catatan ini tidak ditemukan. Kembali ke daftar dan coba lagi.'); return;
    }
    if (type === 'deposit' && !selectedDebt) { setFormError('Pilih utang yang masih memiliki sisa saldo.'); return; }
    if (type === 'debt' && !person.trim()) { setFormError('Nama orang perlu diisi.'); return; }
    if (type === 'routine' && !title.trim()) { setFormError('Nama pengeluaran perlu diisi.'); return; }
    if (!amountValid) { setFormError('Masukkan nominal bulat yang lebih dari nol.'); return; }
    if (type === 'deposit' && amountValue > available) { setFormError(`Setoran tidak boleh melebihi sisa ${formatRupiah(Math.max(0, available))}.`); return; }
    if (!isValidBillDate(dueDate)) { setFormError('Tanggal tidak valid. Gunakan format YYYY-MM-DD.'); return; }
    if (remind && dueDate <= getLocalDateString(new Date())) { setFormError('Untuk pengingat, pilih jatuh tempo mulai besok.'); return; }
    setSaving(true);
    try {
      if (type === 'debt') {
        await saveDebt({ ...(existingDebt ? { id: existingDebt.id } : {}), direction, person: person.trim(), amount: amountValue, dueDate, note: note.trim(), photo: photoChange, remind: Platform.OS !== 'web' && remind });
      } else if (type === 'deposit') {
        await saveDeposit({ ...(existingDeposit ? { id: existingDeposit.id } : {}), debtId, amount: amountValue, date: dueDate, note: note.trim() });
      } else {
        await saveRoutine({ ...(existingRoutine ? { id: existingRoutine.id } : {}), title: title.trim(), category, amount: amountValue, dueDate, frequency, note: note.trim(), remind: Platform.OS !== 'web' && remind });
      }
      router.replace('/catatan');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Catatan belum bisa disimpan. Coba lagi.');
    } finally { setSaving(false); }
  };

  const field = (label: string, value: string, onChange: (text: string) => void, placeholder: string, icon: React.ComponentProps<typeof Feather>['name'], numeric = false) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <View style={[styles.inputShell, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name={icon} size={16} color={colors.mutedForeground} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType={numeric ? 'number-pad' : 'default'}
          style={[styles.input, { color: colors.foreground }]}
          maxLength={numeric ? 10 : 70}
        />
      </View>
    </View>
  );

  if (loading && params.id) return (
    <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.skeleton, { backgroundColor: colors.secondary }]} />
      <View style={[styles.skeletonShort, { backgroundColor: colors.secondary }]} />
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? insets.top + 67 : insets.top }]}>
      <SurfaceBackground />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke Catatan" onPress={() => router.replace('/catatan')} style={styles.back}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{isEditing ? 'Ubah' : 'Tambah'} {heading}</Text>
          <Text style={[styles.headerCaption, { color: colors.mutedForeground }]}>Simpan untuk dirimu sendiri.</Text>
        </View>
      </View>
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 38 }]}
        bottomOffset={72}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {type === 'debt' && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Arah catatan</Text>
            <View style={styles.choiceRow}>
              {([['owe', 'Saya berutang', 'arrow-up-right'], ['owed', 'Mereka berutang', 'arrow-down-left']] as const).map(([value, label, icon]) => (
                <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: direction === value }} onPress={() => setDirection(value)}
                  style={[styles.choice, { borderColor: direction === value ? colors.action : colors.border, backgroundColor: direction === value ? colors.actionSoft : colors.card }]}>
                  <Feather name={icon} size={16} color={direction === value ? colors.action : colors.mutedForeground} />
                  <Text style={[styles.choiceText, { color: direction === value ? colors.action : colors.foreground }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>Pisahkan yang perlu kamu bayar dari yang perlu kamu terima.</Text>
          </View>
        )}

        {type === 'deposit' && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Untuk utang</Text>
            {openDebts.length === 0 ? (
              <View style={[styles.info, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.hint, { color: colors.foreground }]}>Belum ada utang dengan sisa saldo. Buat catatan utang terlebih dahulu.</Text>
                <Pressable onPress={() => router.replace({ pathname: '/catatan-form', params: { type: 'debt' } })}>
                  <Text style={[styles.link, { color: colors.action }]}>Buat utang baru</Text>
                </Pressable>
              </View>
            ) : openDebts.map(debt => {
              const remaining = debt.amount - deposits.filter(x => x.debtId === debt.id).reduce((sum, x) => sum + x.amount, 0);
              return (
                <Pressable key={debt.id} accessibilityRole="button" accessibilityState={{ selected: debtId === debt.id }} onPress={() => setDebtId(debt.id)}
                  style={[styles.debtChoice, { backgroundColor: debtId === debt.id ? colors.secondary : colors.card, borderColor: debtId === debt.id ? colors.primary : colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.choiceText, { color: colors.foreground }]}>{debt.person} · {debt.direction === 'owe' ? 'Saya berutang' : 'Mereka berutang'}</Text>
                    <Text style={[styles.hint, { color: colors.mutedForeground }]}>Sisa {formatRupiah(Math.max(remaining, 0))}</Text>
                  </View>
                  <Feather name={debtId === debt.id ? 'check-circle' : 'circle'} size={18} color={debtId === debt.id ? colors.primary : colors.mutedForeground} />
                </Pressable>
              );
            })}
          </View>
        )}

        <LinearGradient colors={[colors.primaryGlass, colors.primaryGlassDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.amountCard, { borderColor: colors.border }]}>
          <Text style={[styles.amountEyebrow, { color: colors.primaryForeground }]}>{type === 'deposit' ? 'JUMLAH SETORAN' : type === 'routine' ? frequency === 'once' ? 'NOMINAL PENGELUARAN' : 'NOMINAL PER PERIODE' : 'TOTAL UTANG'}</Text>
          <View style={styles.amountRow}>
            <Text style={[styles.amountPrefix, { color: colors.primaryForeground }]}>Rp</Text>
            <TextInput accessibilityLabel="Nominal" value={formatRupiahInput(amount)} onChangeText={text => setAmount(normalizeRupiahInput(text))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.primaryForeground} maxLength={19} style={[styles.amountInput, { color: colors.primaryForeground }]} testID="note-amount" />
          </View>
          {amountValid && <Text style={[styles.amountPreview, { color: colors.primaryForeground }]}>{formatRupiah(amountValue)}{type === 'deposit' ? ` · tersedia ${formatRupiah(Math.max(available, 0))}` : ''}</Text>}
        </LinearGradient>

        {type === 'debt' && field('Nama orang', person, setPerson, 'Dengan siapa catatan ini?', 'user')}
        {type === 'routine' && field('Nama pengeluaran', title, setTitle, 'Contoh: Belanja mingguan', 'edit-3')}
        {type === 'routine' && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Kategori</Text>
            <View style={styles.categoryGrid}>
              {BILL_CATEGORIES.map(item => {
                const selected = category === item.id;
                return (
                  <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setCategory(item.id)}
                    style={[styles.categoryChoice, { backgroundColor: selected ? colors.actionSoft : colors.card, borderColor: selected ? colors.action : colors.border }]}>
                    <Feather name={item.icon} size={15} color={selected ? colors.action : colors.mutedForeground} />
                    <Text style={[styles.categoryText, { color: selected ? colors.action : colors.mutedForeground }]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        {type === 'routine' && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Jenis pengeluaran</Text>
            <View style={styles.choiceRow}>
              {([['once', 'Sekali bayar', 'check-circle'], ['repeat', 'Berulang setiap', 'repeat']] as const).map(([value, label, icon]) => {
                const selected = value === 'once' ? frequency === 'once' : frequency !== 'once';
                return (
                  <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setFrequency(value === 'once' ? 'once' : repeatFrequency)}
                    style={[styles.choice, { backgroundColor: selected ? colors.actionSoft : colors.card, borderColor: selected ? colors.action : colors.border }]}>
                    <Feather name={icon} size={16} color={selected ? colors.action : colors.mutedForeground} />
                    <Text style={[styles.choiceText, { color: selected ? colors.action : colors.foreground }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {frequency !== 'once' && (
              <>
                <Text style={[styles.label, { color: colors.foreground, marginTop: 7 }]}>Periode pengulangan</Text>
                <View style={styles.choiceRow}>
                  {([['weekly', 'Minggu'], ['monthly', 'Bulan']] as const).map(([value, label]) => (
                    <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: frequency === value }} onPress={() => { setFrequency(value); setRepeatFrequency(value); }}
                      style={[styles.choice, { backgroundColor: frequency === value ? colors.actionSoft : colors.card, borderColor: frequency === value ? colors.action : colors.border }]}>
                      <Feather name={value === 'weekly' ? 'repeat' : 'calendar'} size={16} color={frequency === value ? colors.action : colors.mutedForeground} />
                      <Text style={[styles.choiceText, { color: frequency === value ? colors.action : colors.foreground }]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>{frequency === 'once'
              ? 'Setelah dibayar, pengeluaran masuk riwayat dan tidak muncul lagi.'
              : 'Tanggal berikutnya dibuat setelah kamu mengonfirmasi pembayaran.'}</Text>
          </View>
        )}
        <View style={styles.field}>
          {field(dateLabel, dueDate, text => setDueDate(text.replace(/[^\d-]/g, '').slice(0, 10)), 'YYYY-MM-DD', 'calendar')}
          {isValidBillDate(dueDate) && <Text style={[styles.datePreview, { color: colors.primary }]}>{formatDateInput(dueDate)}</Text>}
          <View style={styles.presets}>
            {([['Hari ini', 0], ['Besok', 1], ['7 hari', 7]] as const).map(([label, offset]) => (
              <Pressable key={label} onPress={() => { const d = new Date(); d.setDate(d.getDate() + offset); setDueDate(getLocalDateString(d)); }} style={[styles.preset, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.presetText, { color: colors.mutedForeground }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {type !== 'deposit' && (
          <View style={[styles.reminder, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.reminderIcon, { backgroundColor: colors.accent }]}><Feather name="bell" size={17} color={colors.accentForeground} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.foreground }]}>Ingatkan saya</Text>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>{Platform.OS === 'web' ? 'Hanya tersedia di ponsel.' : 'Satu pengingat lokal per tanggal jatuh tempo.'}</Text>
            </View>
            <Switch accessibilityLabel="Aktifkan pengingat lokal" value={Platform.OS === 'web' ? false : remind} onValueChange={value => void toggleReminder(value)} disabled={saving} trackColor={{ false: colors.border, true: colors.action }} thumbColor={Platform.OS === 'android' ? colors.card : undefined} />
          </View>
        )}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Catatan tambahan <Text style={{ color: colors.mutedForeground }}>(opsional)</Text></Text>
          <View style={[styles.noteShell, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput accessibilityLabel="Catatan tambahan" multiline textAlignVertical="top" value={note} onChangeText={setNote} placeholder="Rincian kecil yang ingin diingat..." placeholderTextColor={colors.mutedForeground} maxLength={180} style={[styles.noteInput, { color: colors.foreground }]} />
          </View>
        </View>
        {type === 'debt' && (
          <PhotoPickerField label="Foto/bukti hutang" uri={photoChange === undefined ? existingDebt?.photoUri : photoChange?.uri} onChange={setPhotoChange} disabled={saving} />
        )}
        {formError && <View style={[styles.errorBox, { backgroundColor: colors.accent }]}><Feather name="alert-circle" size={16} color={colors.accentForeground} /><Text style={[styles.errorText, { color: colors.accentForeground }]}>{formError}</Text></View>}
        <Pressable accessibilityRole="button" disabled={saving || (type === 'deposit' && openDebts.length === 0)} onPress={() => void submit()} style={({ pressed }) => [styles.save, { backgroundColor: colors.action, opacity: saving || (type === 'deposit' && openDebts.length === 0) ? 0.5 : pressed ? 0.78 : 1 }]}>
          <Feather name="check" size={17} color={colors.actionForeground} />
          <Text style={[styles.saveText, { color: colors.actionForeground }]}>{saving ? 'Menyimpan...' : isEditing ? 'Simpan perubahan' : `Simpan ${heading}`}</Text>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, center: { flex: 1, padding: 22, gap: 16 }, skeleton: { height: 76, borderRadius: 8 }, skeletonShort: { height: 230, borderRadius: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 17 }, back: { width: 34, height: 42, justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.5 }, headerCaption: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: 12 },
  scroll: { flex: 1 }, content: { paddingHorizontal: 20, gap: 21 },
  field: { gap: 9 }, label: { fontFamily: 'Inter_600SemiBold', fontSize: 13 }, hint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17 },
  choiceRow: { flexDirection: 'row', gap: 9 }, choice: { flex: 1, minHeight: 49, borderWidth: 1, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 7 },
  choiceText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 }, debtChoice: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChoice: { minWidth: '30%', flexGrow: 1, flexBasis: '30%', minHeight: 43, borderRadius: 7, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  categoryText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  info: { borderWidth: 1, borderRadius: 7, padding: 14, gap: 9 }, link: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  amountCard: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 19, paddingVertical: 18, overflow: 'hidden' },
  amountEyebrow: { fontFamily: 'Inter_600SemiBold', letterSpacing: 1, fontSize: 10, opacity: 0.8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 }, amountPrefix: { fontFamily: 'Inter_600SemiBold', fontSize: 23, marginRight: 9 },
  amountInput: { flex: 1, minWidth: 0, padding: 0, fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1 }, amountPreview: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 4, opacity: 0.78 },
  inputShell: { minHeight: 49, borderWidth: 1, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  input: { flex: 1, paddingVertical: 11, fontFamily: 'Inter_400Regular', fontSize: 13 },
  datePreview: { fontFamily: 'Inter_500Medium', fontSize: 11 }, presets: { flexDirection: 'row', gap: 8 }, preset: { flex: 1, borderWidth: 1, borderRadius: 6, paddingVertical: 8, alignItems: 'center' },
  presetText: { fontFamily: 'Inter_500Medium', fontSize: 11 }, reminder: { borderRadius: 8, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  reminderIcon: { width: 36, height: 36, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  noteShell: { borderWidth: 1, borderRadius: 7, minHeight: 85, paddingHorizontal: 14, paddingVertical: 11 }, noteInput: { minHeight: 65, fontFamily: 'Inter_400Regular', fontSize: 13, padding: 0 },
  errorBox: { borderRadius: 7, padding: 12, flexDirection: 'row', gap: 8 }, errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 17 },
  save: { height: 52, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});