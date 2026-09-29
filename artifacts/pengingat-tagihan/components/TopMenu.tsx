import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function TopMenu({ active }: { active: 'bills' | 'notes' }) {
  const colors = useColors();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const date = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <View>
      <View accessible accessibilityLabel={`${date}, pukul ${time}`} style={styles.dateTimeRow}>
        <View style={styles.dateGroup}>
          <Feather name="calendar" size={13} color={colors.primary} />
          <Text numberOfLines={1} style={[styles.dateText, { color: colors.mutedForeground }]}>{date}</Text>
        </View>
        <View style={styles.timeGroup}>
          <Feather name="clock" size={13} color={colors.primary} />
          <Text style={[styles.timeText, { color: colors.foreground }]}>{time}</Text>
        </View>
      </View>
      <View accessibilityRole="tablist" style={[styles.wrap, { backgroundColor: colors.action, borderColor: colors.action }]}>
        {([
          { key: 'bills', label: 'Tagihan', icon: 'calendar', route: '/' },
          { key: 'notes', label: 'Catatan', icon: 'book-open', route: '/catatan' },
        ] as const).map((item) => {
          const selected = active === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => { if (!selected) router.replace(item.route); }}
              style={({ pressed }) => [
                styles.tab,
                selected && { backgroundColor: colors.menuButtonBackground, borderColor: colors.menuButtonBackground },
                pressed && styles.pressed,
              ]}
              testID={`menu-${item.key}`}
            >
              <Feather name={item.icon} size={15} color={selected ? colors.primary : colors.actionForeground} />
              <Text style={[styles.label, { color: selected ? colors.primary : colors.actionForeground }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default TopMenu;

const styles = StyleSheet.create({
  dateTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  dateGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  dateText: { fontFamily: 'Inter_500Medium', fontSize: 11, flexShrink: 1 },
  timeGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  wrap: { flexDirection: 'row', padding: 4, borderWidth: 1, borderRadius: 9, gap: 4 },
  tab: { flex: 1, height: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'transparent', borderRadius: 6 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  pressed: { opacity: 0.72 },
});