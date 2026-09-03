import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';

export interface ModelItem {
  id: string;
  name: string;
  provider: string;
  description: string;
  supportsReasoning?: boolean;
  supportsVision?: boolean;
}

export const AVAILABLE_MODELS: ModelItem[] = [
  {
    id: 'beagle-built-in',
    name: 'Socrates Default (Beagle)',
    provider: 'Built-in',
    description: 'System default optimized model with full tool and reasoning support',
    supportsReasoning: true,
    supportsVision: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    description: 'High-intelligence flagship model for complex multi-step reasoning',
    supportsVision: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'OpenAI',
    description: 'Fast, lightweight model for everyday chat and quick Q&A',
    supportsVision: true,
  },
  {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    description: 'Hybrid reasoning and high coding & prose fidelity',
    supportsReasoning: true,
    supportsVision: true,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    description: 'Industry-leading nuanced reasoning and artifact generation',
    supportsVision: true,
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek-R1',
    provider: 'DeepSeek',
    description: 'Specialized deep reasoning model with transparent chain-of-thought',
    supportsReasoning: true,
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek-V3',
    provider: 'DeepSeek',
    description: 'State-of-the-art generalist conversational model',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    description: 'Next-gen multimodal model with sub-second latency',
    supportsVision: true,
  },
];

interface Props {
  visible: boolean;
  selectedId: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  onManageSettings?: () => void;
}

export function ModelPickerModal({ visible, selectedId, onSelect, onClose, onManageSettings }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [filter, setFilter] = useState('');

  const filtered = AVAILABLE_MODELS.filter((m) =>
    m.name.toLowerCase().includes(filter.toLowerCase()) ||
    m.provider.toLowerCase().includes(filter.toLowerCase()) ||
    m.description.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.scrim }]}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: radius.xl }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="sparkles" size={20} color={colors.accent} />
              <Text style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>
                {t('settings.model') || 'Choose Model'}
              </Text>
            </View>
            <AnimatedPressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </AnimatedPressable>
          </View>

          <View style={[styles.searchBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.md }]}>
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
          </View>

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
                    {
                      backgroundColor: isSelected ? colors.surfacePressed : colors.surfaceRaised,
                      borderColor: isSelected ? colors.accent : colors.border,
                      borderRadius: radius.lg,
                    },
                  ]}
                >
                  <View style={styles.itemHeader}>
                    <Text style={[styles.itemName, { color: colors.text, fontFamily: typography.semibold }]}>
                      {item.name}
                    </Text>
                    <View style={[styles.providerBadge, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[styles.providerText, { color: colors.accent, fontFamily: typography.medium }]}>
                        {item.provider}
                      </Text>
                    </View>
                  </View>

                  <Text numberOfLines={2} style={[styles.itemDesc, { color: colors.textMuted, fontFamily: typography.body }]}>
                    {item.description}
                  </Text>

                  <View style={styles.badgesRow}>
                    {item.supportsReasoning ? (
                      <View style={[styles.featureBadge, { backgroundColor: colors.accentSoft }]}>
                        <Ionicons name="bulb-outline" size={12} color={colors.accent} />
                        <Text style={[styles.featureText, { color: colors.accent }]}>Reasoning</Text>
                      </View>
                    ) : null}
                    {item.supportsVision ? (
                      <View style={[styles.featureBadge, { backgroundColor: colors.surface }]}>
                        <Ionicons name="image-outline" size={12} color={colors.textMuted} />
                        <Text style={[styles.featureText, { color: colors.textMuted }]}>Vision</Text>
                      </View>
                    ) : null}
                    {isSelected ? (
                      <View style={[styles.selectedCheck, { marginLeft: 'auto' }]}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                      </View>
                    ) : null}
                  </View>
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
                style={[styles.manageBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.md }]}
              >
                <Ionicons name="settings-outline" size={16} color={colors.text} />
                <Text style={[styles.manageText, { color: colors.text, fontFamily: typography.medium }]}>
                  {t('settings.manage') || 'API & Custom Endpoints...'}
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
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
  },
  sheet: {
    maxHeight: '80%',
    marginHorizontal: 10,
    marginBottom: 20,
    borderWidth: 1,
    overflow: 'hidden',
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
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    height: 40,
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
    paddingHorizontal: 16,
  },
  listContent: {
    paddingVertical: 8,
    gap: 10,
  },
  item: {
    padding: 14,
    borderWidth: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 15,
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
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
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
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderWidth: 1,
  },
  manageText: {
    fontSize: 13,
  },
});

