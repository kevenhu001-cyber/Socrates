import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  deleteCustomTemplate,
  getPromptTemplates,
  subscribePromptTemplates,
  upsertCustomTemplate,
  validateCustomTemplate,
  type MobilePromptTemplate,
} from '../data/chat/prompts';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Screen } from '../components/Screen';
import { showToast } from '../components/Toast';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Skills'>;

/* Web editor categories — `frontend/src/ui/promptTemplates.js`. */
const CATEGORIES = ['writing', 'code', 'learning', 'analysis', 'creative', 'other'] as const;

/* Built-ins carry Ionicons names; a custom template icon is whatever the
 * user typed (emoji or a 1-2 char slug, like the web's `pg` default) —
 * render glyphs as text, names as vector icons. */
function TemplateIcon({ icon, size = 18 }: { icon: string; size?: number }) {
  const { colors } = useTheme();
  const name = (icon || '').trim();
  if (name && Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, name)) {
    return <Ionicons name={name as never} size={size} color={colors.textMuted} />;
  }
  return (
    <Text style={{ color: colors.textMuted, fontSize: Math.max(11, size - 4) }} numberOfLines={1}>
      {name || 'pg'}
    </Text>
  );
}

function TemplateRow({
  template,
  editable,
  onEdit,
  onDelete,
}: {
  template: MobilePromptTemplate;
  editable: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  return (
    <View style={[styles.row, { borderColor: withAlpha(colors.border, 0.4), borderRadius: radius.md, backgroundColor: colors.surface }]}>
      <View style={[styles.rowIcon, { borderColor: withAlpha(colors.border, 0.5) }]}>
        <TemplateIcon icon={template.icon} />
      </View>
      <View style={styles.rowMain}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text, fontFamily: typography.medium }]}>
          {template.title} <Text style={{ color: colors.accent }}>{template.shortcut}</Text>
        </Text>
        <Text numberOfLines={2} style={[styles.rowDesc, { color: colors.textMuted, fontFamily: typography.body }]}>
          {template.description}
        </Text>
      </View>
      {editable ? (
        <View style={styles.rowActions}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={`${t('common.change') || 'Edit'} ${template.title}`}
            onPress={onEdit}
            style={styles.rowAction}
          >
            <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: typography.medium }}>{t('common.change') || 'Edit'}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={`${t('common.delete') || 'Delete'} ${template.title}`}
            onPress={onDelete}
            style={styles.rowAction}
          >
            <Text style={{ color: colors.danger, fontSize: 13, fontFamily: typography.medium }}>{t('common.delete') || 'Delete'}</Text>
          </AnimatedPressable>
        </View>
      ) : null}
    </View>
  );
}

interface EditorDraft {
  id: string;
  title: string;
  shortcut: string;
  description: string;
  icon: string;
  category: string;
  body: string;
  systemPrompt: string;
}

function EditorField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSubtle, fontFamily: typography.medium }]}>{label}</Text>
      {children}
    </View>
  );
}

export function SkillsScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const templates = useSyncExternalStore(subscribePromptTemplates, getPromptTemplates);
  const builtins = templates.filter((template) => template.isBuiltin);
  const customs = templates.filter((template) => !template.isBuiltin);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MobilePromptTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const openEditor = (template: MobilePromptTemplate | null) => {
    /* `tpl-` + base36 timestamp — the web editor's id scheme. */
    setDraft(template
      ? {
          id: template.id,
          title: template.title,
          shortcut: template.shortcut,
          description: template.description,
          icon: template.icon,
          category: template.category || 'other',
          body: template.body,
          systemPrompt: template.systemPrompt,
        }
      : {
          id: `tpl-${Date.now().toString(36)}`,
          title: '',
          shortcut: '/my-skill',
          description: '',
          icon: '',
          category: 'other',
          body: '',
          systemPrompt: '',
        });
  };

  const saveDraft = async () => {
    if (!draft || saving) return;
    const problem = validateCustomTemplate({ id: draft.id, title: draft.title, shortcut: draft.shortcut });
    if (problem !== 'ok') {
      const key = problem === 'title-required'
        ? 'skills.toastTitleRequired'
        : problem === 'shortcut-invalid'
          ? 'skills.toastShortcutInvalid'
          : 'skills.toastShortcutTaken';
      showToast(t(key) || 'Check the title and shortcut', 'warning');
      return;
    }
    setSaving(true);
    try {
      await upsertCustomTemplate({
        id: draft.id,
        title: draft.title.trim(),
        description: draft.description.trim(),
        icon: draft.icon.trim() || 'sparkles-outline',
        category: draft.category,
        shortcut: draft.shortcut.trim(),
        body: draft.body,
        systemPrompt: draft.systemPrompt,
      });
      setDraft(null);
      showToast(t('skills.toastSaved') || 'Skill saved', 'success');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (target) await deleteCustomTemplate(target.id);
  };

  const inputStyle = (multiline = false): StyleProp<TextStyle> => ([
    styles.input,
    multiline ? styles.inputMultiline : null,
    {
      color: colors.text,
      backgroundColor: colors.surfaceRaised,
      borderColor: withAlpha(colors.border, 0.5),
      borderRadius: radius.sm,
      fontFamily: typography.body,
    },
  ]);

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('skills.title') || 'Skills & shortcuts'} onNewChat={() => navigation.navigate('Home')} />
      {draft ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.editorTitle, { color: colors.text, fontFamily: typography.semibold }]}>
            {customs.some((template) => template.id === draft.id)
              ? t('skills.editTitle') || 'Edit skill'
              : t('skills.createTitle') || 'Create skill'}
          </Text>
          <EditorField label={t('skills.fieldTitle') || 'Title'}>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft({ ...draft, title })}
              maxLength={80}
              placeholder={t('skills.phTitle') || 'e.g. Daily standup summary'}
              placeholderTextColor={colors.textSubtle}
              style={inputStyle()}
            />
          </EditorField>
          <EditorField label={t('skills.fieldShortcut') || 'Shortcut'}>
            <TextInput
              value={draft.shortcut}
              onChangeText={(shortcut) => setDraft({ ...draft, shortcut })}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="/my-skill"
              placeholderTextColor={colors.textSubtle}
              style={inputStyle()}
            />
          </EditorField>
          <EditorField label={t('skills.fieldDescription') || 'Description'}>
            <TextInput
              value={draft.description}
              onChangeText={(description) => setDraft({ ...draft, description })}
              maxLength={200}
              placeholder={t('skills.phDesc') || 'What this skill does'}
              placeholderTextColor={colors.textSubtle}
              style={inputStyle()}
            />
          </EditorField>
          <View style={styles.fieldRow}>
            <View style={[styles.field, styles.fieldHalf]}>
              <Text style={[styles.fieldLabel, { color: colors.textSubtle, fontFamily: typography.medium }]}>
                {t('skills.fieldIcon') || 'Icon'}
              </Text>
              <TextInput
                value={draft.icon}
                onChangeText={(icon) => setDraft({ ...draft, icon })}
                maxLength={24}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('skills.phIcon') || 'e.g. sparkles-outline or an emoji'}
                placeholderTextColor={colors.textSubtle}
                style={inputStyle()}
              />
            </View>
            <View style={[styles.field, styles.fieldHalf]}>
              <Text style={[styles.fieldLabel, { color: colors.textSubtle, fontFamily: typography.medium }]}>
                {t('skills.fieldCategory') || 'Category'}
              </Text>
              <View style={styles.categoryRow}>
                {CATEGORIES.map((category) => {
                  const active = draft.category === category;
                  return (
                    <AnimatedPressable
                      key={category}
                      accessibilityRole="button"
                      accessibilityLabel={category}
                      accessibilityState={{ selected: active }}
                      onPress={() => setDraft({ ...draft, category })}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: active ? colors.accent : colors.surfaceRaised,
                          borderColor: active ? colors.accent : withAlpha(colors.border, 0.5),
                        },
                      ]}
                    >
                      <Text style={{ color: active ? colors.textInverse : colors.textMuted, fontSize: 12, fontFamily: typography.medium }}>
                        {t(`skills.category.${category}`) === `skills.category.${category}` ? category : t(`skills.category.${category}`)}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
            </View>
          </View>
          <EditorField label={t('skills.fieldBody') || 'Body'}>
            <TextInput
              value={draft.body}
              onChangeText={(body) => setDraft({ ...draft, body })}
              multiline
              placeholder={t('skills.phBody') || 'Text inserted into the composer when the skill is picked'}
              placeholderTextColor={colors.textSubtle}
              style={inputStyle(true)}
            />
          </EditorField>
          <EditorField label={t('skills.fieldSystem') || 'System prompt'}>
            <TextInput
              value={draft.systemPrompt}
              onChangeText={(systemPrompt) => setDraft({ ...draft, systemPrompt })}
              multiline
              placeholder={t('skills.phSystem') || 'Instructions the model follows while this skill is active'}
              placeholderTextColor={colors.textSubtle}
              style={inputStyle(true)}
            />
          </EditorField>
          <View style={styles.editorActions}>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel') || 'Cancel'}
              onPress={() => setDraft(null)}
              style={[styles.secondaryBtn, { borderColor: withAlpha(colors.border, 0.5), borderRadius: radius.md }]}
            >
              <Text style={{ color: colors.textMuted, fontFamily: typography.medium }}>{t('common.cancel') || 'Cancel'}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={t('common.done') || 'Save'}
              disabled={saving}
              onPress={() => { void saveDraft(); }}
              style={[styles.primaryBtn, { backgroundColor: colors.text, borderRadius: radius.md, opacity: saving ? 0.6 : 1 }]}
            >
              <Text style={{ color: colors.background, fontFamily: typography.semibold }}>
                {saving ? t('common.saving') || 'Saving…' : t('common.done') || 'Save'}
              </Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.intro, { color: colors.textMuted, fontFamily: typography.body }]}>
            {t('skills.intro') || 'Use a skill for a focused workflow, or create one with your own instructions and /shortcut.'}
          </Text>
          <Text style={[styles.sectionLabel, { color: colors.textSubtle, fontFamily: typography.medium }]}>
            {t('skills.builtins', { count: builtins.length })}
          </Text>
          {builtins.map((template) => (
            <TemplateRow key={template.id} template={template} editable={false} />
          ))}
          <Text style={[styles.sectionLabel, styles.sectionLabelGap, { color: colors.textSubtle, fontFamily: typography.medium }]}>
            {t('skills.yours', { count: customs.length })}
          </Text>
          {customs.length ? (
            customs.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                editable
                onEdit={() => openEditor(template)}
                onDelete={() => setPendingDelete(template)}
              />
            ))
          ) : (
            <Text style={[styles.empty, { color: colors.textSubtle, fontFamily: typography.body }]}>
              {t('skills.empty') || 'No custom skills yet.'}
            </Text>
          )}
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={t('skills.create') || 'Create skill'}
            onPress={() => openEditor(null)}
            style={[styles.createBtn, { borderColor: withAlpha(colors.border, 0.5), borderRadius: radius.md }]}
          >
            <Ionicons name="add" size={18} color={colors.text} />
            <Text style={{ color: colors.text, fontFamily: typography.medium, fontSize: 14 }}>
              {t('skills.create') || 'Create skill'}
            </Text>
          </AnimatedPressable>
        </ScrollView>
      )}
      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t('skills.deleteTitle') || 'Delete skill?'}
        message={t('skills.deleteBody') || 'This removes the custom skill permanently.'}
        confirmLabel={t('common.delete') || 'Delete'}
        cancelLabel={t('common.cancel') || 'Cancel'}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => { void confirmDelete(); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  intro: { fontSize: 13, lineHeight: 20, marginBottom: 18 },
  sectionLabel: { fontSize: 12, marginBottom: 8 },
  sectionLabelGap: { marginTop: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14 },
  rowDesc: { fontSize: 12, marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 12 },
  rowAction: { paddingVertical: 6, paddingHorizontal: 2 },
  empty: { fontSize: 13, paddingVertical: 8 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
    marginTop: 12,
  },
  editorTitle: { fontSize: 20, marginBottom: 16 },
  field: { marginBottom: 14 },
  fieldHalf: { flex: 1, minWidth: 0 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontSize: 12, marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  secondaryBtn: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 10 },
  primaryBtn: { paddingHorizontal: 18, paddingVertical: 10 },
});
