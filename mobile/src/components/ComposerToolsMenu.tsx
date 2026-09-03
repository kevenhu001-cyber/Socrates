import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import { ThinkDeeperGlyph } from './Composer';

export interface ComposerToolsMenuProps {
  visible: boolean;
  onClose: () => void;
  onPickCamera: () => void;
  onPickPhotos: () => void;
  onPickFiles: () => void;
  onPickPlugins?: () => void;
  onToggleThinkDeeper?: () => void;
  isThinkDeeperActive?: boolean;
}

export function ComposerToolsMenu({
  visible,
  onClose,
  onPickCamera,
  onPickPhotos,
  onPickFiles,
  onPickPlugins,
  onToggleThinkDeeper,
  isThinkDeeperActive = false,
}: ComposerToolsMenuProps) {
  const { colors, typography } = useTheme();
  const t = useT();

  /* Frontend runs the picked action immediately; the previous 100ms
   * deferral made the menu feel laggy with no web equivalent. */
  const handleAction = (action: () => void) => {
    onClose();
    action();
  };

  const menuItems = [
    {
      id: 'camera',
      icon: 'camera-outline' as const,
      label: t('composer.tools.camera') || 'Camera',
      onPress: () => handleAction(onPickCamera),
      active: false,
      useCustomGlyph: false,
    },
    {
      id: 'photos',
      icon: 'image-outline' as const,
      label: t('composer.tools.photos') || 'Photos',
      onPress: () => handleAction(onPickPhotos),
      active: false,
      useCustomGlyph: false,
    },
    {
      id: 'files',
      icon: 'attach-outline' as const,
      label: t('composer.tools.files') || 'Files',
      onPress: () => handleAction(onPickFiles),
      active: false,
      useCustomGlyph: false,
    },
    ...(onPickPlugins
      ? [
          {
            id: 'plugins',
            icon: 'globe-outline' as const,
            label: t('composer.tools.plugins') || 'Plugins',
            onPress: () => handleAction(onPickPlugins),
            active: false,
            useCustomGlyph: false,
          },
        ]
      : []),
    ...(onToggleThinkDeeper
      ? [
          {
            id: 'thinkDeeper',
            icon: 'bulb-outline' as const,
            label: t('composer.tools.thinkDeeper') || 'Think deeper',
            onPress: () => {
              onToggleThinkDeeper();
              onClose();
            },
            active: isThinkDeeperActive,
            useCustomGlyph: true,
          },
        ]
      : []),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable onPress={onClose} style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {menuItems.map((item) => (
            <AnimatedPressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={item.onPress}
              style={styles.itemRow}
            >
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: colors.surfacePressed,
                  },
                ]}
              >
                {item.useCustomGlyph ? (
                  <ThinkDeeperGlyph
                    size={20}
                    color={item.active ? colors.accent : colors.text}
                  />
                ) : (
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={item.active ? colors.accent : colors.text}
                  />
                )}
              </View>

              <Text
                style={[
                  styles.itemLabel,
                  {
                    color: colors.text,
                    fontFamily: typography.medium,
                  },
                ]}
              >
                {item.label}
              </Text>

              {item.active ? (
                <Ionicons name="checkmark" size={18} color={colors.accent} style={styles.checkIcon} />
              ) : null}
            </AnimatedPressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    /* backgroundColor is now sourced from `colors.scrim` at the call
     * site so the dimming follows the canonical palette per theme. */
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 76,
  },
  card: {
    width: 232,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  itemLabel: {
    flex: 1,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  checkIcon: {
    marginLeft: 8,
  },
});
