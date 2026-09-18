import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import type { ApiProvider } from '../data/api/client';

interface Props {
  visible: boolean;
  providers: ApiProvider[];
  selectedId: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  onManageSettings?: () => void;
}

export function ModelPickerModal({ visible, providers, selectedId, onSelect, onClose, onManageSettings }: Props) {
  const { colors, typography } = useTheme();
  const t = useT();
  const [filter, setFilter] = useState('');

  const sorted = providers.slice().sort((a, b) => Number(Boolean(b.isBuiltIn)) - Number(Boolean(a.isBuiltIn)));
  const filtered = sorted.filter((provider) => {
    const q = filter.toLowerCase();
    return String(provider.label || '').toLowerCase().includes(q)
      || String(provider.model || '').toLowerCase().includes(q)
      || String(provider.url || '').toLowerCase().includes(q);
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.borderStrong, borderRadius: 6 }]}>
          {providers.length >= 4 ? <View style={[styles.searchBox, { backgroundColor: 'transparent', borderColor: colors.border, borderRadius: 4 }]}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              value={filter}
              onChangeText={setFilter}
              placeholder={t('search.placeholder') || 'Search models...'}
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text, fontFamily: typography.body }]}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View> : null}

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {filtered.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <AnimatedPressable
                  key={item.id}
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  style={[
                    styles.item,
                    { backgroundColor: isSelected ? withAlpha(colors.accent, 0.08) : 'transparent' },
                  ]}
                >
                  <Ionicons name={item.isBuiltIn ? 'compass-outline' : 'hardware-chip-outline'} size={18} color={isSelected ? colors.accent : colors.textMuted} />
                  <View style={styles.itemMain}>
                    <Text style={[styles.itemName, { color: isSelected ? colors.accent : colors.textSecondary, fontFamily: typography.medium }]}>
                      {(item.label && item.label !== 'Default') ? item.label : (item.model || item.label || 'Model')}
                    </Text>
                  </View>
                    {!item.isBuiltIn ? (
                      <Text numberOfLines={1} style={[styles.itemDesc, { color: colors.textMuted, fontFamily: typography.body }]}>
                        {item.model || item.url}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? (
                    <View style={[styles.selectedCheck, { marginLeft: 'auto' }]}>
                      <Ionicons name="checkmark" size={14} color={colors.accent} />
                    </View>
                  ) : null}
                </AnimatedPressable>
              );
            })}
          </ScrollView>

          {onManageSettings ? (
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <AnimatedPressable
                onPress={() => {
                  onClose();
                  onManageSettings();
                }}
                style={styles.manageBtn}
              >
                <Text style={[styles.manageText, { color: colors.textMuted, fontFamily: typography.body }]}>
                  {providers.length ? 'Manage models…' : 'Add a model…'}
                </Text>
              </AnimatedPressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 62,
    paddingRight: 8,
    backgroundColor: 'transparent',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
  },
  sheet: {
    width: 320,
    minWidth: 220,
    maxWidth: '92%',
    maxHeight: 320,
    borderWidth: 1,
    padding: 3,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 3,
    marginTop: 3,
    marginBottom: 3,
    paddingHorizontal: 6,
    borderWidth: 1,
    height: 32,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  list: {
    paddingHorizontal: 0,
  },
  listContent: {
    paddingVertical: 0,
    gap: 1,
  },
  item: {
    width: '100%',
    minHeight: 38,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 0,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemMain: { flex: 1, minWidth: 0, gap: 1 },
  itemName: {
    fontSize: 13,
  },
  providerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  providerText: {
    fontSize: 11,
  },
  itemDesc: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  featureText: {
    fontSize: 11,
  },
  selectedCheck: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: 0,
    marginTop: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  manageBtn: {
    justifyContent: 'center',
    minHeight: 31,
    paddingHorizontal: 9,
    borderWidth: 0,
  },
  manageText: {
    fontSize: 12,
  },
});

