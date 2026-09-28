import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { BILL_CATEGORIES, ensureReminderPermission, type BillCategory, useBills } from '@/contexts/BillsContext';
import { useColors } from '@/hooks/useColors';
import { formatDateInput, formatRupiah, getDaysUntilDue, getLocalDateString, isValidBillDate } from '@/lib/bill-format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type DatePreset = { label: string; offset: number };
const DATE_PRESETS: DatePreset[] = [
  { label: 'Hari ini', offset: 0 },
  { label: 'Besok', offset: 1 },
  { label: '1 minggu', offset: 7 },
];

export default function BillFormScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { bills, saveBill } = useBills();
  const existing = useMemo(() => (id ? bills.find((bill) => bill.id === id) : undefined), [bills, id]);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [category, setCategory] = useState<BillCategory>(existing?.category ?? 'electricity');
  const [note, setNote] = useState(existing?.note ?? '');
  const [remind, setRemind] = useState(existing?.remind ?? false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const amountValue = Number(amount);
  const amountValid = Number.isFinite(amountValue) && amountValue > 0;
  const dateValid = isValidBillDate(dueDate);
  const titleValid = title.trim().length > 0;

  const toggleReminder = async (nextValue: boolean) => {
    setFormError(null);
    if (!nextValue) {
      setRemind(false);
      return;
    }

    if (Platform.OS === 'web') {
      setFormError('Pengingat lokal tersedia di aplikasi ponsel, bukan pratinjau web.');
      return;
    }

    try {
      const permission = await ensureReminderPermission();
      if (permission.granted) {
        setRemind(true);
        return;
      }
      setRemind(false);
      if (permission.status === 'denied' && !permission.canAskAgain) {
        Alert.alert(
          'Izin notifikasi nonaktif',
          'Buka pengaturan perangkat untuk mengizinkan pengingat tagihan.',
          [
            { text: 'Nanti', style: 'cancel' },
            {
              text: 'Buka pengaturan',
              onPress: () => {
                void Linking.openSettings().catch(() => {
                  setFormError('Pengaturan perangkat belum bisa dibuka. Aktifkan notifikasi secara manual.');
                });
              },
            },
          ],
        );
      } else {
        setFormError('Izin notifikasi belum diberikan. Tagihan tetap tersimpan tanpa pengingat lokal.');
      }
    } catch {
      setFormError('Izin notifikasi belum bisa diperiksa. Coba lagi dari pengaturan perangkat.');
    }
  };

  const setDatePreset = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    setDueDate(getLocalDateString(date));
  };

  const submit = async () => {
    setFormError(null);
    if (!titleValid) {
      setFormError('Nama tagihan perlu diisi.');
      return;
    }
    if (!amountValid) {
      setFormError('Masukkan nominal tagihan yang lebih dari nol.');
      return;
    }
    if (!dateValid) {
      setFormError('Masukkan tanggal yang valid dengan format YYYY-MM-DD.');
      return;
    }
    if (remind && getDaysUntilDue(dueDate) < 1) {
      setFormError('Untuk pengingat otomatis, pilih jatuh tempo mulai besok.');
      return;
    }

    setSaving(true);
    try {
      await saveBill({
        ...(existing ? { id: existing.id } : {}),
        title: title.trim(),
        amount: amountValue,
        dueDate,
        category,
        note: note.trim(),
        isPaid: existing?.isPaid ?? false,
        remind,
      });
      router.back();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Tagihan belum bisa disimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

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
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {existing ? 'Ubah tagihan' : 'Tagihan baru'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            Simpan rapi, ingat tepat waktu.
          </Text>
        </View>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.formContent,
          { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 32 },
        ]}
        bottomOffset={72}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.amountCard, { backgroundColor: colors.primary }]}>
          <Text style={[styles.amountLabel, { color: colors.primaryForeground }]}>NOMINAL TAGIHAN</Text>
          <View style={styles.amountInputRow}>
            <Text style={[styles.currencyPrefix, { color: colors.primaryForeground }]}>Rp</Text>
            <TextInput
              accessibilityLabel="Nominal tagihan"
              value={amount}
              onChangeText={(value) => setAmount(value.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.primaryForeground}
              returnKeyType="next"
              style={[styles.amountInput, { color: colors.primaryForeground }]}
              maxLength={15}
              testID="bill-amount"
            />
          </View>
          {amountValid ? <Text style={[styles.amountFormatted, { color: colors.primaryForeground }]}>{formatRupiah(amountValue)}</Text> : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>Nama tagihan</Text>
          <View style={[styles.inputShell, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="edit-3" size={16} color={colors.mutedForeground} />
            <TextInput
              accessibilityLabel="Nama tagihan"
              value={title}
              onChangeText={setTitle}
              placeholder="Contoh: Internet rumah"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="sentences"
              returnKeyType="next"
              style={[styles.textInput, { color: colors.foreground }]}
              maxLength={60}
              testID="bill-title"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>Kategori</Text>
          <View style={styles.categoryGrid}>
            {BILL_CATEGORIES.map((item) => {
              const selected = item.id === category;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setCategory(item.id)}
                  style={({ pressed }) => [
                    styles.categoryOption,
                    { backgroundColor: selected ? colors.secondary : colors.card, borderColor: selected ? colors.primary : colors.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather name={item.icon} size={15} color={selected ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.categoryText, { color: selected ? colors.primary : colors.mutedForeground }]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: colors.foreground }]}>Jatuh tempo</Text>
            {dateValid ? <Text style={[styles.datePreview, { color: colors.primary }]}>{formatDateInput(dueDate)}</Text> : null}
          </View>
          <View style={styles.datePresets}>
            {DATE_PRESETS.map((preset) => (
              <Pressable
                key={preset.label}
                accessibilityRole="button"
                onPress={() => setDatePreset(preset.offset)}
                style={({ pressed }) => [
                  styles.datePreset,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.datePresetText, { color: colors.mutedForeground }]}>{preset.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.inputShell, { backgroundColor: colors.card, borderColor: dateValid ? colors.border : formError && dueDate ? colors.destructive : colors.border }]}>
            <Feather name="calendar" size={16} color={colors.mutedForeground} />
            <TextInput
              accessibilityLabel="Tanggal jatuh tempo"
              value={dueDate}
              onChangeText={(value) => setDueDate(value.replace(/[^\d-]/g, '').slice(0, 10))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="default"
              returnKeyType="next"
              style={[styles.textInput, { color: colors.foreground }]}
              maxLength={10}
              testID="bill-due-date"
            />
          </View>
        </View>

        <View style={[styles.reminderRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.reminderIcon, { backgroundColor: colors.accent }]}>
            <Feather name="bell" size={17} color={colors.accentForeground} />
          </View>
          <View style={styles.reminderCopy}>
            <Text style={[styles.reminderTitle, { color: colors.foreground }]}>Ingatkan saya</Text>
            <Text style={[styles.reminderDescription, { color: colors.mutedForeground }]}>
              H-1 pukul 09.00, atau pagi saat jatuh tempo.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Aktifkan pengingat lokal"
            value={remind}
            onValueChange={(value) => void toggleReminder(value)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={Platform.OS === 'android' ? (remind ? colors.primaryForeground : colors.card) : undefined}
            disabled={saving}
            testID="bill-reminder-switch"
          />
        </View>
        {Platform.OS === 'web' ? (
          <Text style={[styles.platformNote, { color: colors.mutedForeground }]}>
            Pengingat otomatis berjalan di aplikasi ponsel. Pratinjau web hanya menyimpan tagihan.
          </Text>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>Catatan (opsional)</Text>
          <View style={[styles.noteShell, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              accessibilityLabel="Catatan tagihan"
              value={note}
              onChangeText={setNote}
              placeholder="Nomor pelanggan atau info pembayaran"
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={180}
              textAlignVertical="top"
              style={[styles.noteInput, { color: colors.foreground }]}
              testID="bill-note"
            />
          </View>
        </View>

        {formError ? (
          <View style={[styles.errorBox, { backgroundColor: colors.accent }]}>
            <Feather name="alert-circle" size={15} color={colors.accentForeground} />
            <Text style={[styles.errorText, { color: colors.accentForeground }]}>{formError}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={existing ? 'Simpan perubahan' : 'Simpan tagihan'}
          disabled={saving}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.primary, opacity: saving ? 0.65 : 1 },
            pressed && !saving ? styles.pressed : null,
          ]}
          testID="save-bill"
        >
          {saving ? (
            <Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>Menyimpan...</Text>
          ) : (
            <>
              <Feather name="check" size={17} color={colors.primaryForeground} />
              <Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>
                {existing ? 'Simpan perubahan' : 'Simpan tagihan'}
              </Text>
            </>
          )}
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 17, gap: 13 },
  backButton: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.5 },
  headerSubtitle: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: 12 },
  scroll: { flex: 1 },
  formContent: { paddingHorizontal: 20, gap: 19 },
  amountCard: { borderRadius: 22, paddingHorizontal: 19, paddingTop: 18, paddingBottom: 17 },
  amountLabel: { opacity: 0.76, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  currencyPrefix: { fontFamily: 'Inter_600SemiBold', fontSize: 23, marginRight: 9 },
  amountInput: { flex: 1, padding: 0, fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1.1 },
  amountFormatted: { opacity: 0.7, marginTop: 3, fontFamily: 'Inter_500Medium', fontSize: 11 },
  fieldGroup: { gap: 9 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePreview: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  inputShell: { minHeight: 49, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  textInput: { flex: 1, paddingVertical: 11, fontFamily: 'Inter_400Regular', fontSize: 13 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryOption: { minWidth: '30%', flexGrow: 1, flexBasis: '30%', minHeight: 43, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  categoryText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  datePresets: { flexDirection: 'row', gap: 8 },
  datePreset: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 },
  datePresetText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  reminderRow: { borderRadius: 17, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  reminderIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reminderCopy: { flex: 1, minWidth: 0 },
  reminderTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  reminderDescription: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  platformNote: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: -11 },
  noteShell: { minHeight: 84, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  noteInput: { flex: 1, minHeight: 60, padding: 0, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12 },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
  saveButton: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 1 },
  saveButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  pressed: { opacity: 0.8 },
});