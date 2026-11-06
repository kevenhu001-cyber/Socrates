/**
 * RN-7 — the sidebar's outer shell: the brand lockup, the header icon
 * actions (search, new chat, collapse) and the primary navigation rows.
 * The session list (rows, drag, rename, virtualisation) is not part of this
 * file and stays with the web host.
 *
 * Language: the marketing site's chrome (public.css nav pills, product.css
 * jump-nav). Rows are 36px with 12px corners; hover takes the 4% fill; the
 * current destination is a small white card (`card` + raised hairline
 * shadow), never a coloured bar or a dot.
 *
 * Geometry lives in `StyleSheet.create` so it compiles to plain classes on
 * the web: the shell's page-level CSS (collapsed 52px rail, phone drawer,
 * per-destination order) can still re-shape the rows without fighting
 * inline styles. Only the interactive paint (hover / current) is inline.
 *
 * DOM-free: the host passes ids (`nativeID`), labels, glyph names, i18n keys
 * (forwarded as `data-*` so the web i18n pass can retitle the controls) and
 * press handlers. `hostStyle` lets a web host attach its structural class
 * hooks through react-native-web's compiled-style escape hatch.
 */
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type PressableStateCallbackType, type StyleProp, type ViewStyle, type ImageStyle, type TextStyle } from 'react-native';
import { uiControl, uiMotion, uiRadius, uiStep } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiIcon, type UiGlyphName } from '../primitives/UiIcon';
import { dataSet } from '../learn/parts';

type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiStep[75],
    minWidth: 0,
    height: uiControl.row,
    paddingHorizontal: uiStep[50] + 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiStep[25],
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    minWidth: 32,
    borderRadius: uiRadius.pill,
  },
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: uiStep[50] + 2,
    width: '100%',
    height: uiControl.row,
    minHeight: uiControl.row,
    flexShrink: 0,
    paddingHorizontal: uiStep[75] + 2,
    borderRadius: uiRadius.md,
  },
  glyph: {
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiStep[50] + 2,
    minWidth: 0,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: uiStep[50] + 2,
    paddingVertical: uiStep[25],
    borderRadius: uiRadius.pill,
    borderWidth: 1,
  },
});

/* ── Brand lockup ────────────────────────────────────────────────────── */

export interface SidebarBrandProps {
  name: string;
  /** The mark, as an image source the host resolves ('/logo.png' on the web). */
  logo: { uri: string };
  /** Phones: the drawer's 24px mark and 28px line. */
  compact?: boolean;
  hostStyle?: StyleProp<ViewStyle>;
  logoStyle?: StyleProp<ImageStyle>;
  nameStyle?: StyleProp<TextStyle>;
  /** Draw a ⌄ after the name (the phone drawer's reference lockup). Decorative. */
  caret?: boolean;
  /** Hide the mark and let the wordmark carry the lockup. */
  hideLogo?: boolean;
}

/** The mark and the wordmark. Decorative: the drawer is named by its nav landmark. */
export function SidebarBrand({ name, logo, compact = false, hostStyle, logoStyle, nameStyle, caret = false, hideLogo = false }: SidebarBrandProps) {
  const { colors, fontFamily, typeScale } = useUiTheme();
  const size = compact ? 24 : 20;
  return (
    <View aria-hidden style={[styles.brand, hostStyle]} {...dataSet({ part: 'sidebar-brand' })}>
      {hideLogo ? null : <Image source={logo} accessibilityIgnoresInvertColors style={[{ width: size, height: size, borderRadius: uiRadius.xs }, logoStyle]} />}
      <Text
        numberOfLines={1}
        {...dataSet({ part: 'brand-name' })}
        style={[{
          fontFamily,
          fontSize: Math.round(18 * typeScale * 10) / 10,
          lineHeight: compact ? 28 : 20,
          fontWeight: '600',
          letterSpacing: compact ? -0.36 : -0.18,
          color: colors.ink,
        }, nameStyle]}
      >
        {name}
      </Text>
      {caret ? (
        <View {...dataSet({ part: 'brand-caret' })}>
          <UiIcon name="chevron-down" size={16} color={colors.inkSecondary} />
        </View>
      ) : null}
    </View>
  );
}

/* ── Header icon action ──────────────────────────────────────────────── */

export interface SidebarIconActionProps {
  id: string;
  icon: UiGlyphName;
  label: string;
  /** i18n key the web host re-applies to `title` / `aria-label` on a language switch. */
  i18nKey?: string;
  expanded?: boolean;
  controls?: string;
  visible?: boolean;
  iconSize?: number;
  hostStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
}

export function SidebarIconAction({ id, icon, label, i18nKey, expanded, controls, visible = true, iconSize = 20, hostStyle, onPress }: SidebarIconActionProps) {
  const { colors } = useUiTheme();
  return (
    <Pressable
      nativeID={id}
      role="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-hidden={!visible}
      onPress={onPress}
      {...dataSet({ i18nTitle: i18nKey, i18nAria: i18nKey, sidebarAction: id })}
      style={({ pressed, hovered }: PressState) => [
        styles.iconButton,
        hostStyle,
        {
          /* Only ever forces `none`: when shown, the host's layout CSS decides. */
          ...(visible ? null : { display: 'none' }),
          backgroundColor: pressed ? colors.fillPressed : hovered ? colors.fill : 'transparent',
          transitionProperty: 'background-color',
          transitionDuration: `${uiMotion.fast}ms`,
        } as object,
      ]}
    >
      <UiIcon name={icon} size={iconSize} color={colors.ink} />
    </Pressable>
  );
}

/** The trailing group of header actions. */
export function SidebarHeaderActions({ children, hostStyle }: { children: ReactNode; hostStyle?: StyleProp<ViewStyle> }) {
  return <View style={[styles.actions, hostStyle]}>{children}</View>;
}

/* ── Primary navigation row ──────────────────────────────────────────── */

export interface SidebarNavRowProps {
  id: string;
  /** The destination key, published as `data-nav`. */
  navKey: string;
  icon: UiGlyphName;
  label: string;
  /** i18n key for the label and the collapsed rail's tooltip. */
  i18nKey?: string;
  /** A small outlined word after the label ("新"). */
  badge?: string;
  badgeI18nKey?: string;
  active: boolean;
  /** Rows that open a menu (更多) announce it. */
  menu?: { expanded: boolean; controls: string };
  /** Web: `var(--ui-elevation-raised)` so the active theme decides the lift. */
  activeShadow?: string;
  hostStyle?: StyleProp<ViewStyle>;
  badgeStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  onPress: () => void;
}

export function SidebarNavRow({ id, navKey, icon, label, i18nKey, badge, badgeI18nKey, active, menu, activeShadow, hostStyle, badgeStyle, labelStyle, onPress }: SidebarNavRowProps) {
  const { colors, fontFamily, typeScale } = useUiTheme();
  return (
    <Pressable
      nativeID={id}
      role="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? menu.expanded : undefined}
      aria-controls={menu ? menu.controls : undefined}
      onPress={onPress}
      {...dataSet({ nav: navKey, i18nTitle: i18nKey })}
      style={({ pressed, hovered, focused }: PressState) => [
        styles.row,
        hostStyle,
        /* Resting rows set no paint of their own, so a host can still mark
           a row as the implied current place (new chat on the empty home). */
        active
          ? { backgroundColor: colors.card, boxShadow: activeShadow ?? `0 0 0 1px ${colors.hairline}` }
          : pressed
            ? { backgroundColor: colors.fillPressed }
            : hovered || focused || menu?.expanded
              ? { backgroundColor: colors.fill }
              : null,
        { transitionProperty: 'background-color', transitionDuration: `${uiMotion.fast}ms` } as object,
      ]}
    >
      <View aria-hidden style={styles.glyph} {...dataSet({ part: 'nav-glyph' })}>
        <UiIcon name={icon} size={20} color={colors.ink} />
      </View>
      <View style={styles.labelWrap} {...dataSet({ part: 'nav-label' })}>
        <UiText
          variant="bodySm"
          numberOfLines={1}
          {...dataSet({ i18nKey })}
          style={[{ fontWeight: active ? '500' : '400', flexShrink: 1 }, labelStyle]}
        >
          {label}
        </UiText>
        {badge ? (
          <Text
            aria-hidden
            numberOfLines={1}
            {...dataSet({ i18nKey: badgeI18nKey })}
            style={[styles.badge, { fontFamily, fontSize: Math.round(10 * typeScale * 10) / 10, lineHeight: 14, fontWeight: '600', color: colors.inkTertiary, borderColor: colors.hairlineStrong }, badgeStyle]}
          >
            {badge}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
