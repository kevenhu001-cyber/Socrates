import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ApiProvider } from '../data/api/client';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import { Sheet } from './Sheet';
import { providerName, providerSubline } from './ModelPickerModal';
import type { ReasoningEffort } from './Composer';

export interface ModelConfigSheetProps {
  visible: boolean;
  providers: ApiProvider[];
  selectedId: string;
  effort: ReasoningEffort;
  onSelectModel: (modelId: string) => void | Promise<void>;
  onChangeEffort: (effort: ReasoningEffort) => void;
  onManageSettings?: () => void;
  onClose: () => void;
}

const EFFORTS: ReasoningEffort[] = ['high', 'medium', 'low'];

/* Phone-form model + thinking-intensity sheet — the ChatGPT "配置" bottom
 * sheet: stacked provider rows, an inline-expanding intensity row, and a
 * pinned Done button. The anchored `ModelPickerModal` remains the
 * tablet/desktop path; ExamScreen still uses it too. */
export function ModelConfigSheet({
  visible,
  providers,
  selectedId,
  effort,
  onSelectModel,
  onChangeEffort,
  onManageSettings,
  onClose,
}: ModelConfigSheetProps) {
  const { colors, typography } = useTheme();
  const t = useT();
  const [effortExpanded, setEffortExpanded] = useState(false);

  const sorted = useMemo(
    () => providers.slice().sort((a, b) => Number(Boolean(b.isBuiltIn)) - Number(Boolean(a.isBuiltIn))),
    [providers],
  );

  const effortLabel = (value: ReasoningEffort) =>
    value === 'high' ? (t('effort.high') || 'High')
      : value === 'low' ? (t('effort.low') || 'Low')
        : (t('effort.medium') || 'Medium');

  return (
    <Sheet visible={visible} onClose={onClose} maxWidth={480} testID="model-config-sheet">
      <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
      <Text style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>
        {t('composer.configure')}
      </Text>
      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.modelList}>
          {sorted.map((provider) => {
            const selected = provider.id === selectedId;
            const subline = providerSubline(provider);
            return (
              <AnimatedPressable
                key={provider.id}
                accessibilityRole="button"
                accessibilityLabel={providerName(provider)}
                accessibilityState={{ selected }}
                onPress={() => void onSelectModel(provider.id)}
                /* `surface` (#292929), not `surfaceRaised`: the sheet itself
                 * already paints `surfaceRaised` (#0d0d0d), so same-token
                 * rows were invisible — the reference config sheet shows
                 * each model as a distinct lighter-grey card. */
                style={[styles.row, { backgroundColor: colors.surface }]}
              >
                <View style={styles.rowMain}>
                  <Text numberOfLines={1} style={[styles.rowName, { color: colors.text, fontFamily: typography.medium }]}>
                    {providerName(provider)}
                  </Text>
                  {subline ? (
                    <Text numberOfLines={1} style={[styles.rowSub, { color: colors.textMuted, fontFamily: typography.body }]}>
                      {subline}
                    </Text>
                  ) : null}
                </View>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.text} /> : null}
              </AnimatedPressable>
            );
          })}
        </View>

        <View style={[styles.row, styles.effortRow, { backgroundColor: colors.surface }]}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t('composer.thinkingIntensity')}
            accessibilityState={{ expanded: effortExpanded }}
            onPress={() => setEffortExpanded((current) => !current)}
            style={styles.effortToggle}
          >
            <Text style={[styles.rowName, { color: colors.text, fontFamily: typography.medium }]}>
              {t('composer.thinkingIntensity')}
            </Text>
            <View style={styles.effortValue}>
              <Text style={[styles.rowSub, { color: colors.textMuted, fontFamily: typography.body }]}>
                {effortLabel(effort)}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </View>
          </AnimatedPressable>
          {effortExpanded ? (
            <View style={[styles.effortOptions, { borderTopColor: withAlpha(colors.border, 0.35) }]}>
              {EFFORTS.map((value) => (
                <AnimatedPressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={effortLabel(value)}
                  accessibilityState={{ selected: effort === value }}
                  onPress={() => {
                    onChangeEffort(value);
                    setEffortExpanded(false);
                  }}
                  style={styles.effortOption}
                >
                  <Text style={[styles.rowName, { color: colors.text, fontFamily: typography.body }]}>
                    {effortLabel(value)}
                  </Text>
                  {effort === value ? <Ionicons name="checkmark" size={18} color={colors.text} /> : null}
                </AnimatedPressable>
              ))}
            </View>
          ) : null}
        </View>

        {onManageSettings ? (
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              onManageSettings();
            }}
            style={styles.manage}
          >
            <Text style={[styles.manageText, { color: colors.textMuted, fontFamily: typography.body }]}>
              {providers.length ? 'Manage models…' : 'Add a model…'}
            </Text>
          </AnimatedPressable>
        ) : null}
      </ScrollView>

      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={t('common.done')}
        onPress={onClose}
        style={[styles.done, { backgroundColor: colors.text }]}
      >
        <Text style={[styles.doneLabel, { color: colors.background, fontFamily: typography.semibold }]}>
          {t('common.done')}
        </Text>
      </AnimatedPressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
  },
  title: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  body: {
    flexGrow: 0,
  },
  modelList: {
    gap: 8,
    paddingHorizontal: 14,
  },
  row: {
    /* Reference config sheet rows are tall (~64px) 16px-radius cards. */
    borderRadius: 16,
    minHeight: 62,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontSize: 16,
  },
  rowSub: {
    fontSize: 13,
  },
  effortRow: {
    marginTop: 24,
    marginHorizontal: 14,
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 0,
  },
  effortToggle: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  effortValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  effortOptions: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  effortOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  manage: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  manageText: {
    fontSize: 13,
  },
  done: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 14,
  },
  doneLabel: {
    fontSize: 16,
  },
});
