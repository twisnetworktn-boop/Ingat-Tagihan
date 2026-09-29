import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function TopMenu({ active }: { active: 'bills' | 'notes' }) {
  const colors = useColors();
  return (
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
  );
}

export default TopMenu;

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 4, borderWidth: 1, borderRadius: 9, gap: 4 },
  tab: { flex: 1, height: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'transparent', borderRadius: 6 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  pressed: { opacity: 0.72 },
});