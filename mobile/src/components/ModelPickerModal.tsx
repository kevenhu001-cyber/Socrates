import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ApiProvider } from '../data/api/client';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';

export interface ModelPickerAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  visible: boolean;
  providers: ApiProvider[];
  selectedId: string;
  anchor?: ModelPickerAnchor | null;
  variant?: 'landing' | 'chat';
  onSelect: (modelId: string) => void | Promise<void>;
  onClose: () => void;
  onManageSettings?: () => void;
}

function providerName(provider: ApiProvider): string {
  if (provider.label && provider.label !== 'Default') return provider.label;
  return provider.model || provider.label || 'Model';
}

function providerSubline(provider: ApiProvider): string {
  if (provider.isBuiltIn) return '';
  if (provider.model && provider.model !== providerName(provider)) return provider.model;
  return provider.url || '';
}

/**
 * Native projection of the SPA model picker. Data is the same live
 * /api/api-key registry; geometry mirrors .model-picker-menu and
 * .chat-model-menu.model-picker-menu.
 */
export function ModelPickerModal({
  visible,
  providers,
  selectedId,
  anchor,
  variant = 'chat',
  onSelect,
  onClose,
  onManageSettings,
}: Props) {
  const { colors, typography } = useTheme();
  const t = useT();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [filter, setFilter] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setFilter('');
    opacity.setValue(0);
    progress.setValue(0);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [opacity, progress, visible]);

  const sorted = useMemo(
    () => providers.slice().sort((a, b) => Number(Boolean(b.isBuiltIn)) - Number(Boolean(a.isBuiltIn))),
    [providers],
  );

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return sorted;
    return sorted.filter((provider) =>
      (String(provider.label || '') + ' ' + String(provider.model || '') + ' ' + String(provider.url || ''))
        .toLowerCase()
        .includes(query),
    );
  }, [filter, sorted]);

  const maxMenuWidth = variant === 'landing' ? 340 : 320;
  const menuWidth = Math.min(maxMenuWidth, Math.max(220, viewportWidth - 16));
  const triggerCenter = anchor ? anchor.x + anchor.width / 2 : viewportWidth / 2;
  const desiredLeft = variant === 'landing'
    ? triggerCenter - menuWidth / 2
    : anchor
      ? anchor.x + anchor.width - menuWidth
      : viewportWidth - menuWidth - 8;
  const left = Math.max(8, Math.min(viewportWidth - menuWidth - 8, desiredLeft));
  const desiredTop = anchor ? anchor.y + anchor.height + 4 : 62;
  const top = Math.max(8, Math.min(desiredTop, Math.max(8, viewportHeight - 328)));

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable accessibilityLabel={t('common.close') || 'Close'} onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View
        style={[
          styles.menu,
          {
            top,
            left,
            width: menuWidth,
            maxHeight: Math.min(320, viewportHeight - top - 8),
            backgroundColor: colors.background,
            borderColor: withAlpha(colors.border, 0.4),
            opacity,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        {sorted.length >= 4 ? (
          <View style={[styles.filter, { borderBottomColor: withAlpha(colors.border, 0.25) }]}>
            <Ionicons name="search-outline" size={12} color={colors.textSubtle} />
            <TextInput
              autoFocus
              value={filter}
              onChangeText={setFilter}
              placeholder={t('search.filterModels') || 'Filter…'}
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.filterInput,
                {
                  color: colors.text,
                  borderColor: withAlpha(colors.border, 0.4),
                  fontFamily: typography.body,
                },
              ]}
            />
          </View>
        ) : null}

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSubtle, fontFamily: typography.body }]}>
              {filter
                ? (t('search.noMatches') || 'No matches.')
                : (t('settings.noCustomProviders') || 'No models yet. Open Settings to add one.')}
            </Text>
          ) : filtered.map((provider) => {
            const selected = provider.id === selectedId;
            const subline = providerSubline(provider);
            return (
              <AnimatedPressable
                key={provider.id}
                scale={0.985}
                onPress={() => {
                  void onSelect(provider.id);
                  onClose();
                }}
                style={[
                  styles.item,
                  { backgroundColor: selected ? withAlpha(colors.accent, 0.08) : 'transparent' },
                ]}
              >
                <Ionicons
                  name={provider.isBuiltIn ? 'compass-outline' : 'hardware-chip-outline'}
                  size={18}
                  color={selected ? colors.accent : colors.textMuted}
                />
                <View style={styles.itemMain}>
                  <Text
                    numberOfLines={1}
                    style={[styles.itemName, { color: selected ? colors.accent : colors.textSecondary, fontFamily: typography.medium }]}
                  >
                    {providerName(provider)}
                  </Text>
                  {subline ? (
                    <Text numberOfLines={1} style={[styles.itemSub, { color: colors.textSubtle, fontFamily: typography.body }]}>
                      {subline}
                    </Text>
                  ) : null}
                </View>
                {selected ? <Ionicons name="checkmark" size={14} color={colors.accent} /> : <View style={styles.checkSpace} />}
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        <View style={[styles.divider, { backgroundColor: withAlpha(colors.border, 0.25) }]} />
        <AnimatedPressable
          onPress={() => {
            onClose();
            onManageSettings?.();
          }}
          style={styles.manage}
        >
          <Text style={[styles.manageText, { color: colors.textMuted, fontFamily: typography.body }]}>
            {providers.length ? 'Manage models…' : 'Add a model…'}
          </Text>
        </AnimatedPressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 6,
    padding: 3,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 3,
  },
  filterInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 28,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 12,
  },
  item: {
    width: '100%',
    minHeight: 38,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemMain: { flex: 1, minWidth: 0, gap: 1 },
  itemName: { fontSize: 13, lineHeight: 17 },
  itemSub: { fontSize: 11, lineHeight: 14 },
  checkSpace: { width: 14, height: 14 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 3 },
  manage: {
    width: '100%',
    minHeight: 31,
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  manageText: { fontSize: 12 },
  empty: { padding: 10, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
