/**
 * The sidebar's outer shell: the brand lockup, the header icon actions
 * (search, new chat, collapse) and the primary navigation rows. The session
 * list (rows, drag, rename, virtualisation) is not part of this file and stays
 * with the web host.
 *
 * Language: the marketing site's chrome (public.css nav pills, product.css
 * jump-nav). Rows are 36px with 12px corners; hover takes the 4% fill; the
 * current destination is a small white card (`card` + raised hairline
 * shadow), never a coloured bar or a dot.
 *
 * React DOM by design (ADR 0027). The desktop row height, phone 44px touch
 * rung and collapsed rail come from the shell CSS, not from inline geometry:
 * an inline height would win over the phone media query. Only the interactive
 * paint (hover / current) is inline.
 *
 * DOM-free: the host passes ids, labels, glyph names, i18n keys (forwarded as
 * `data-*` so the web i18n pass can retitle the controls), press handlers and
 * structural class hooks through `hostStyle`.
 */
import type { CSSProperties, ReactNode } from 'react';
import { uiControl, uiMotion, uiRadius, uiStep } from '@socrates/theme';
import { dataAttributes } from '../domProps';
import { domClassName, domStyle, type TextStyle, type ViewStyle } from '../domStyle';
import { useUiTheme } from '../primitives/theme';
import { usePressFeedback } from '../primitives/UiButton';
import { UiText, type UiTextStyle } from '../primitives/UiText';
import { UiIcon, type UiGlyphName } from '../primitives/UiIcon';

const styles: Record<string, ViewStyle> = {
  brand: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiStep[75],
    minWidth: 0,
    height: uiControl.row,
    paddingLeft: uiStep[50] + 2,
    paddingRight: uiStep[50] + 2,
  },
  actions: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiStep[25],
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    minWidth: 32,
    padding: 0,
    borderRadius: uiRadius.pill,
  },
  row: {
    position: 'relative',
    flexShrink: 0,
  },
  glyph: {
    width: 20,
    height: 20,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiStep[50] + 2,
    minWidth: 0,
    flexShrink: 1,
  },
  badge: {
    paddingLeft: uiStep[50] + 2,
    paddingRight: uiStep[50] + 2,
    paddingTop: uiStep[25],
    paddingBottom: uiStep[25],
    borderRadius: uiRadius.pill,
    borderWidth: 1,
    borderStyle: 'solid',
  },
};

function clamp(lines?: number): CSSProperties | undefined {
  if (!lines || lines < 1) return undefined;
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

/* ── Brand lockup ────────────────────────────────────────────────────── */

export interface SidebarBrandProps {
  name: string;
  /** The mark, as an image source the host resolves ('/logo.png' on the web). */
  logo: { uri: string };
  /** Phones: the drawer's 24px mark and 28px line. */
  compact?: boolean;
  hostStyle?: unknown;
  logoStyle?: unknown;
  nameStyle?: unknown;
  /** Draw a ⌄ after the name (the phone drawer's reference lockup). Decorative. */
  caret?: boolean;
  /** Hide the mark and let the wordmark carry the lockup. */
  hideLogo?: boolean;
  /**
   * Take the lockup out of the layout entirely.
   *
   * The brand paints its own `display: flex` / height inline, and an inline
   * declaration wins over the shell stylesheet — so a host that folds the
   * column to an icon rail cannot hide the wordmark from CSS alone: it keeps
   * its 117px box inside the 52px rail and is clipped mid-word ("Socra…").
   * Same contract as `SidebarIconAction.visible`: the only thing this prop
   * ever forces is `display: none`; when shown, the host's layout CSS decides.
   */
  hidden?: boolean;
}

/** The mark and the wordmark. Decorative: the drawer is named by its nav landmark. */
export function SidebarBrand({
  name,
  logo,
  compact = false,
  hostStyle,
  logoStyle,
  nameStyle,
  caret = false,
  hideLogo = false,
  hidden = false,
}: SidebarBrandProps) {
  const { colors, fontFamily, typeScale } = useUiTheme();
  const size = compact ? 24 : 20;
  return (
    <div
      aria-hidden
      className={domClassName(hostStyle)}
      style={domStyle([
        styles.brand,
        hostStyle,
        /* Last, so it wins over the base row: a folded rail has no room for
           the lockup, and an inline `display: none` is the one value a host
           stylesheet cannot take back. */
        hidden ? { display: 'none' } : null,
      ])}
      {...dataAttributes({ part: 'sidebar-brand' })}
    >
      {hideLogo ? null : (
        <img
          src={logo.uri}
          alt=""
          className={domClassName(logoStyle)}
          style={{
            width: size,
            height: size,
            borderRadius: uiRadius.xs,
            ...domStyle(logoStyle),
          }}
        />
      )}
      <span
        {...dataAttributes({ part: 'brand-name' })}
        className={domClassName(nameStyle)}
        style={domStyle([
          {
            fontFamily,
            fontSize: Math.round(18 * typeScale * 10) / 10,
            lineHeight: compact ? '28px' : '20px',
            fontWeight: '600',
            letterSpacing: compact ? -0.36 : -0.18,
            color: colors.ink,
          },
          nameStyle,
          clamp(1),
        ])}
      >
        {name}
      </span>
      {caret ? (
        <div {...dataAttributes({ part: 'brand-caret' })}>
          <UiIcon name="chevron-down" size={16} color={colors.inkSecondary} />
        </div>
      ) : null}
    </div>
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
  controlSize?: number;
  backgroundVar?: string;
  hostStyle?: unknown;
  onPress: () => void;
}

export function SidebarIconAction({
  id,
  icon,
  label,
  i18nKey,
  expanded,
  controls,
  visible = true,
  iconSize = 20,
  controlSize,
  backgroundVar,
  hostStyle,
  onPress,
}: SidebarIconActionProps) {
  const { colors } = useUiTheme();
  const { pressed, hovered, handlers } = usePressFeedback();
  return (
    <button
      type="button"
      id={id}
      role="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-hidden={!visible}
      onClick={onPress}
      {...dataAttributes({ i18nTitle: i18nKey, i18nAria: i18nKey, sidebarAction: id })}
      {...handlers}
      className={domClassName(hostStyle)}
      style={domStyle([
        styles.iconButton,
        hostStyle,
        {
          /* Only ever forces `none`: when shown, the host's layout CSS decides. */
          ...(visible ? null : { display: 'none' }),
          ...(controlSize
            ? { width: controlSize, height: controlSize, minWidth: controlSize }
            : null),
          backgroundColor: pressed
            ? colors.fillPressed
            : hovered
              ? colors.fill
              : backgroundVar
                ? `var(${backgroundVar}, transparent)`
                : 'transparent',
          transitionProperty: 'background-color',
          transitionDuration: `${uiMotion.fast}ms`,
        },
      ])}
    >
      <UiIcon name={icon} size={iconSize} color={colors.ink} />
    </button>
  );
}

/** The trailing group of header actions. */
export function SidebarHeaderActions({
  children,
  hostStyle,
}: {
  children: ReactNode;
  hostStyle?: unknown;
}) {
  return (
    <div className={domClassName(hostStyle)} style={domStyle([styles.actions, hostStyle])}>
      {children}
    </div>
  );
}

/* ── Primary navigation row ──────────────────────────────────────────── */

export interface SidebarNavRowProps {
  id: string;
  /** The destination key, published as `data-nav`. */
  navKey: string;
  icon: UiGlyphName;
  iconSize?: number;
  iconStrokeWidth?: number;
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
  hostStyle?: unknown;
  badgeStyle?: unknown;
  labelStyle?: unknown;
  /**
   * Web-only escape hatch: read the row's state paint from this CSS custom
   * property and use the inline palette only as its fallback. The phone
   * drawer sets the property to its reference values.
   */
  backgroundVar?: string;
  onPress: () => void;
}

export function SidebarNavRow({
  id,
  navKey,
  icon,
  iconSize = 20,
  iconStrokeWidth,
  label,
  i18nKey,
  badge,
  badgeI18nKey,
  active,
  menu,
  activeShadow,
  hostStyle,
  badgeStyle,
  labelStyle,
  backgroundVar,
  onPress,
}: SidebarNavRowProps) {
  const { colors, fontFamily, typeScale } = useUiTheme();
  const { pressed, hovered, focused, handlers } = usePressFeedback();
  const statePaint = active
    ? colors.card
    : pressed
      ? colors.fillPressed
      : hovered || focused || menu?.expanded
        ? colors.fill
        : 'transparent';

  return (
    <button
      type="button"
      id={id}
      role="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? menu.expanded : undefined}
      aria-controls={menu ? menu.controls : undefined}
      onClick={onPress}
      {...dataAttributes({ nav: navKey, i18nTitle: i18nKey })}
      {...handlers}
      className={domClassName(hostStyle)}
      style={domStyle([
        styles.row,
        hostStyle,
        /* Resting rows paint transparent unless the host supplies a
           background variable, so a host can still mark a row as the
           implied current place (new chat on the empty home). */
        {
          backgroundColor: backgroundVar ? `var(${backgroundVar}, ${statePaint})` : statePaint,
          ...(active ? { boxShadow: activeShadow ?? `0 0 0 1px ${colors.hairline}` } : null),
        },
        {
          transitionProperty: 'background-color',
          transitionDuration: `${uiMotion.fast}ms`,
        },
      ])}
    >
      <div aria-hidden style={domStyle([styles.glyph])} {...dataAttributes({ part: 'nav-glyph' })}>
        <UiIcon name={icon} size={iconSize} color={colors.ink} strokeWidth={iconStrokeWidth} />
      </div>
      <div style={domStyle([styles.labelWrap])} {...dataAttributes({ part: 'nav-label' })}>
        <UiText
          variant="bodySm"
          numberOfLines={1}
          {...dataAttributes({ i18nKey })}
          style={[{ fontWeight: active ? '500' : '400', flexShrink: 1 }, labelStyle as UiTextStyle]}
        >
          {label}
        </UiText>
        {badge ? (
          <span
            aria-hidden
            {...dataAttributes({ i18nKey: badgeI18nKey })}
            className={domClassName(badgeStyle)}
            style={domStyle([
              styles.badge,
              {
                fontFamily,
                fontSize: Math.round(10 * typeScale * 10) / 10,
                lineHeight: '14px',
                fontWeight: '600',
                color: colors.inkTertiary,
                borderColor: colors.hairlineStrong,
              },
              badgeStyle,
              clamp(1),
            ])}
          >
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}
