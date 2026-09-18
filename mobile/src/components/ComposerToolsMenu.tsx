import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MobileExtensionKey } from '../data/chat/prompts';
import type { ComposerPluginSelection } from '../data/chat/plugins';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import { ThinkDeeperGlyph } from './Composer';
import { Popover } from './Popover';

export interface ComposerToolsAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComposerToolsMenuProps {
  visible: boolean;
  surface?: 'topic' | 'chat';
  anchor?: ComposerToolsAnchor | null;
  onClose: () => void;
  onPickCamera: () => void;
  onPickPhotos: () => void;
  onPickFiles: () => void;
  onPickWrite?: () => void;
  onPickExplore?: () => void;
  onPickAnalyze?: () => void;
  onPickExam?: () => void;
  onPickSkills?: () => void;
  onToggleThinkDeeper?: () => void;
  activeExtension?: MobileExtensionKey | null;
  isThinkDeeperActive?: boolean;
  plugins?: ComposerPluginSelection[];
  selectedPluginIds?: string[];
  onTogglePlugin?: (pluginId: string) => void;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type MenuItem = {
  id: string;
  icon: IconName;
  label: string;
  hint?: string;
  active?: boolean;
  customThinking?: boolean;
  onPress: () => void;
};

export function ComposerToolsMenu({
  visible,
  surface = 'chat',
  anchor,
  onClose,
  onPickCamera,
  onPickPhotos,
  onPickFiles,
  onPickWrite,
  onPickExplore,
  onPickAnalyze,
  onPickExam,
  onPickSkills,
  onToggleThinkDeeper,
  activeExtension = null,
  isThinkDeeperActive = false,
  plugins = [],
  selectedPluginIds = [],
  onTogglePlugin,
}: ComposerToolsMenuProps) {
  const { colors, typography } = useTheme();
  const t = useT();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return undefined;
    setQuery('');
    return undefined;
  }, [visible]);

  const runAndClose = (action?: () => void) => {
    if (!action) return;
    onClose();
    action();
  };

  const rows = useMemo<MenuItem[]>(() => {
    const base: MenuItem[] = [
      {
        id: 'camera',
        icon: 'camera-outline',
        label: t('composer.tools.camera') || 'Camera',
        onPress: () => runAndClose(onPickCamera),
      },
      {
        id: 'photos',
        icon: 'image-outline',
        label: t('composer.tools.photos') || 'Photos',
        onPress: () => runAndClose(onPickPhotos),
      },
      {
        id: 'files',
        icon: 'attach-outline',
        label: t('composer.tools.files') || 'Files',
        onPress: () => runAndClose(onPickFiles),
      },
    ];

    if (onPickWrite) {
      base.push({
        id: 'write',
        icon: 'pencil-outline',
        label: t('composer.write') || 'Write & edit',
        hint: t('composer.writeHint') || 'Draft, rewrite and polish',
        active: activeExtension === 'write',
        onPress: () => runAndClose(onPickWrite),
      });
    }
    if (onPickExplore) {
      base.push({
        id: 'explore',
        icon: 'compass-outline',
        label: t('composer.explore') || 'Explore',
        hint: t('composer.exploreHint') || 'Scope, batch search, report',
        active: activeExtension === 'explore',
        onPress: () => runAndClose(onPickExplore),
      });
    }
    if (onPickAnalyze) {
      base.push({
        id: 'analyze',
        icon: 'stats-chart-outline',
        label: t('composer.analyze') || 'Analyze data',
        hint: t('composer.analyzeHint') || 'Calculate, chart and export',
        active: activeExtension === 'analyze',
        onPress: () => runAndClose(onPickAnalyze),
      });
    }
    if (onPickExam) {
      base.push({
        id: 'exam',
        icon: 'document-text-outline',
        label: t('composer.exam') || 'Generate exam',
        hint: t('composer.examHint') || 'Blueprint, questions and grading',
        onPress: () => runAndClose(onPickExam),
      });
    }
    if (onPickSkills) {
      base.push({
        id: 'skills',
        icon: 'grid-outline',
        label: t('composer.menu.skills') || 'Your workflows',
        hint: t('composer.menu.skillsHint') || 'Create your own',
        onPress: () => runAndClose(onPickSkills),
      });
    }
    if (onToggleThinkDeeper) {
      base.push({
        id: 'think-deeper',
        icon: 'bulb-outline',
        label: t('composer.tools.thinkDeeper') || 'Think deeper',
        hint: t('effort.high.note') || 'More deliberate reasoning',
        active: isThinkDeeperActive,
        customThinking: true,
        onPress: () => runAndClose(onToggleThinkDeeper),
      });
    }

    for (const plugin of plugins.filter((item) => item.connected === true)) {
      base.push({
        id: `plugin:${plugin.id}`,
        icon: 'extension-puzzle-outline',
        label: plugin.name,
        hint: plugin.description || plugin.capabilities.join(', '),
        active: selectedPluginIds.includes(plugin.id),
        onPress: () => runAndClose(
          onTogglePlugin ? () => onTogglePlugin(plugin.id) : undefined,
        ),
      });
    }

    return base;
  }, [
    activeExtension,
    isThinkDeeperActive,
    onPickAnalyze,
    onPickCamera,
    onPickExam,
    onPickExplore,
    onPickFiles,
    onPickPhotos,
    onPickSkills,
    onPickWrite,
    onTogglePlugin,
    onToggleThinkDeeper,
    plugins,
    selectedPluginIds,
    t,
  ]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      `${row.label} ${row.hint || ''}`.toLowerCase().includes(needle),
    );
  }, [query, rows]);

  const compact = viewportWidth <= 768;
  const menuWidth = compact
    ? Math.min(252, viewportWidth - 24)
    : surface === 'topic'
      ? Math.min(620, viewportWidth - 16)
      : Math.min(280, viewportWidth - 16);
  const maxHeight = Math.max(120, Math.min(viewportHeight / 2, 560));
  const estimatedHeight = Math.min(maxHeight, 52 + filteredRows.length * (compact ? 46 : 40));
  const target = anchor || {
    x: 20,
    y: Math.max(8, viewportHeight - 118),
    width: 40,
    height: 40,
  };
  const desiredLeft = compact ? target.x - 12 : target.x;
  const left = Math.max(8, Math.min(desiredLeft, viewportWidth - menuWidth - 8));
  const belowTop = target.y + target.height + 8;
  const aboveTop = target.y - estimatedHeight - 8;
  const belowSpace = viewportHeight - belowTop - 8;
  const aboveSpace = target.y - 8;
  const rawTop = belowSpace >= estimatedHeight
    ? belowTop
    : aboveSpace >= estimatedHeight
      ? aboveTop
      : Math.max(8, target.y - estimatedHeight - 8);
  const top = Math.max(8, Math.min(rawTop, viewportHeight - estimatedHeight - 8));

  return (
    <Popover
      visible={visible}
      onClose={onClose}
      maxWidth={menuWidth}
      testID="composer-tools-menu"
      style={[
        styles.card,
        {
          top,
          left,
          width: menuWidth,
          maxHeight,
          backgroundColor: withAlpha(colors.surface, 0.98),
          borderColor: colors.border,
        },
      ]}
    >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
        >
          {filteredRows.map((item) => (
            <AnimatedPressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: Boolean(item.active) }}
              onPress={item.onPress}
              style={styles.item}
            >
              <View style={styles.iconWrap}>
                {item.customThinking ? (
                  <ThinkDeeperGlyph
                    size={22}
                    color={item.active ? colors.accent : colors.textMuted}
                  />
                ) : (
                  <Ionicons
                    name={item.icon}
                    size={compact ? 22 : 18}
                    color={item.active ? colors.accent : colors.textMuted}
                  />
                )}
              </View>
              <View style={styles.copy}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    {
                      color: item.active ? colors.accent : colors.text,
                      fontFamily: typography.medium,
                      fontSize: compact ? 14 : 13.5,
                    },
                  ]}
                >
                  {item.label}
                </Text>
                {item.hint ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.hint,
                      { color: colors.textSubtle, fontFamily: typography.body },
                    ]}
                  >
                    {item.hint}
                  </Text>
                ) : null}
              </View>
              {item.active ? (
                <Ionicons name="checkmark" size={18} color={colors.accent} />
              ) : null}
            </AnimatedPressable>
          ))}
          {!filteredRows.length ? (
            <Text style={[styles.empty, { color: colors.textSubtle, fontFamily: typography.body }]}>
              {t('composer.tools.noMatch') || 'No matching tools.'}
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.searchRow, { borderTopColor: withAlpha(colors.border, 0.3) }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('composer.tools.searchFooter') || 'Search plugins, files, folders and skills'}
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text, fontFamily: typography.body }]}
          />
        </View>
    </Popover>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    padding: 6,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 18,
  },
  list: {
    paddingBottom: 2,
  },
  item: {
    width: '100%',
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  label: {
    lineHeight: 20,
  },
  hint: {
    fontSize: 11,
    lineHeight: 14,
  },
  empty: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 12,
    textAlign: 'center',
  },
  searchRow: {
    minHeight: 40,
    marginTop: 2,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontSize: 13,
  },
});
