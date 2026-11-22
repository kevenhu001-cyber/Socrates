/**
 * Home empty state (RN-1 sample module).
 *
 * Two islands, because the composer sits between them on the page:
 *   - HomeHero         the welcome line, set large and tight;
 *   - HomeSuggestions  the entry points under (desktop) or above (phone)
 *                      the composer: pill shortcuts in chat mode, numbered
 *                      starter cards in tutor mode.
 *
 * The module owns layout and look only. Copy, behaviour and persistence stay
 * with the host, which passes strings, callbacks and the compact breakpoint
 * — so the same component mounts in the web shell and another React host.
 *
 * Motion: the suggestions rise in once when the host swaps their content.
 * Reduced-motion users get them in place.
 */
import type { CSSProperties } from 'react';
import { uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiButton, usePressFeedback } from '../primitives/UiButton';
import { UiIcon, type UiGlyphName } from '../primitives/UiIcon';
import { useReducedMotion } from '../turn/parts';
import { R, S, focusRing, insetRing, shadow, sheets, transition } from '../look';

/** Below this width the host asks for the phone composition. */
export const HOME_COMPACT_WIDTH = 769;

const BUTTON_RESET: CSSProperties = {
  display: 'flex',
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
};

export interface HomeHeroProps {
  title: string;
  /** Short line under the title. Omit to show the title alone. */
  subtitle?: string;
  /** DOM id on web (`nativeID`), kept for hosts that address the title. */
  titleId?: string;
  /** Host-decided phone composition. */
  compact?: boolean;
}

export function HomeHero({ title, subtitle, titleId, compact = false }: HomeHeroProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: uiSpace[3],
      }}
    >
      <UiText
        nativeID={titleId}
        role="heading"
        aria-level={1}
        variant={compact ? 'greetingCompact' : 'greeting'}
        style={compact ? { fontWeight: '400' } : undefined}
        align="center"
      >
        {title}
      </UiText>
      {subtitle ? (
        <UiText variant={compact ? 'bodySm' : 'body'} tone="secondary" align="center">
          {subtitle}
        </UiText>
      ) : null}
    </div>
  );
}

export interface HomeShortcut {
  id: string;
  label: string;
  /** Toggle shortcuts (web search) report their state. */
  pressed?: boolean;
  /** Leading line glyph (RN-7: every shortcut carries one). */
  icon?: UiGlyphName;
}

export interface HomeStarter {
  id: string;
  title: string;
  hint: string;
}

export interface HomeShortcutsProps {
  items: readonly HomeShortcut[];
  onSelect: (id: string) => void;
  onDismiss: (id: string) => void;
  dismissLabel: string;
  /** Group label for assistive tech. */
  label: string;
  compact?: boolean;
}

/** Chat mode: a centred row of pale grey capsules, each with a quiet dismiss. */
export function HomeShortcuts({
  items,
  onSelect,
  onDismiss,
  dismissLabel,
  label,
  compact = false,
}: HomeShortcutsProps) {
  const { colors } = useUiTheme();
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: compact ? 'nowrap' : 'wrap',
        justifyContent: compact ? 'flex-start' : 'center',
        gap: uiSpace[2],
      }}
    >
      {items.map((item) => (
        <HomeShortcutItem
          key={item.id}
          item={item}
          compact={compact}
          colors={colors}
          onSelect={onSelect}
          onDismiss={onDismiss}
          dismissLabel={dismissLabel}
        />
      ))}
    </div>
  );
}

function HomeShortcutItem({
  item,
  compact,
  colors,
  onSelect,
  onDismiss,
  dismissLabel,
}: {
  item: HomeShortcut;
  compact: boolean;
  colors: ReturnType<typeof useUiTheme>['colors'];
  onSelect: (id: string) => void;
  onDismiss: (id: string) => void;
  dismissLabel: string;
}) {
  const { pressed, hovered, focused, handlers } = usePressFeedback();
  return (
    <div
      data-testid={`home-shortcut-${item.id}`}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: uiRadius.pill,
        backgroundColor: item.pressed ? colors.ink : colors.fill,
        border: `1px solid ${item.pressed ? colors.hairlineStrong : colors.hairline}`,
      }}
    >
      <UiButton
        testID={`home-shortcut-action-${item.id}`}
        label={item.label}
        variant={item.pressed ? 'primary' : 'ghost'}
        size={compact ? 'sm' : 'md'}
        leading={
          item.icon ? (
            <UiIcon
              name={item.icon}
              size={compact ? 16 : 18}
              color={item.pressed ? colors.onInk : colors.inkSecondary}
            />
          ) : undefined
        }
        {...(item.pressed === undefined ? {} : { 'aria-pressed': item.pressed })}
        onPress={() => onSelect(item.id)}
      />
      {/* Touch has no hover, so phones drop the dismiss (it would only be
          reachable by a long-press that also opens the context menu). */}
      {compact ? null : (
        <button
          type="button"
          data-testid={`home-shortcut-dismiss-${item.id}`}
          aria-label={dismissLabel}
          onClick={() => onDismiss(item.id)}
          {...handlers}
          style={{
            ...BUTTON_RESET,
            width: 24,
            height: 24,
            marginRight: uiSpace[2],
            marginLeft: -uiSpace[1],
            borderRadius: uiRadius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed
              ? colors.fillPressed
              : hovered
                ? colors.fillHover
                : 'transparent',
            ...focusRing(colors, focused),
          }}
        >
          {/* A real 14px line glyph: the bare "×" character rendered at
            label size read as a dot. */}
          <UiIcon
            name="close"
            size={14}
            color={item.pressed ? colors.onInk : colors.inkSecondary}
          />
        </button>
      )}
    </div>
  );
}

export interface HomeStartersProps {
  heading: string;
  headingId?: string;
  items: readonly HomeStarter[];
  onSelect: (id: string) => void;
  compact?: boolean;
}

/** Tutor mode: an eyebrow heading and three numbered cards. */
export function HomeStarters({
  heading,
  headingId,
  items,
  onSelect,
  compact = false,
}: HomeStartersProps) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: compact ? uiSpace[3] : uiSpace[4] }}
    >
      <UiText
        nativeID={headingId}
        role="heading"
        aria-level={2}
        variant="labelSm"
        tone="tertiary"
        align={compact ? 'left' : 'center'}
      >
        {heading}
      </UiText>
      {compact ? (
        /* Phones scroll the cards sideways: three stacked cards would bury
           the composer on short screens. */
        <div
          className="home-starters-rail"
          style={{ display: 'flex', flexDirection: 'row', gap: uiSpace[2], overflowX: 'auto' }}
        >
          {items.map((item, index) => (
            <div key={item.id} style={{ width: 'min(280px, 72vw)', flexShrink: 0 }}>
              <StarterCard item={item} index={index} compact onSelect={onSelect} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'row', gap: uiSpace[3] }}>
          {items.map((item, index) => (
            <div key={item.id} style={{ flexGrow: 1, flexBasis: 0 }}>
              <StarterCard item={item} index={index} compact={false} onSelect={onSelect} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Starter card (site `.story-step` / `.m-card`): a #f9f9f9 sheet on a
 * hairline ring with a 24px radius, the index in a white ringed disc, the
 * title and one line of hint. Hover lifts it onto white with the site's
 * second shadow (`.news-item:hover`); reduced motion keeps it in place.
 */
function StarterCard({
  item,
  index,
  compact,
  onSelect,
}: {
  item: HomeStarter;
  index: number;
  compact: boolean;
  onSelect: (id: string) => void;
}) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { subtle } = sheets(colors);
  const { scale, hovered, focused, handlers } = usePressFeedback();
  const lift = hovered && !reduced;
  return (
    <button
      type="button"
      data-testid={`home-starter-${item.id}`}
      aria-label={`${item.title}. ${item.hint}`}
      onClick={() => onSelect(item.id)}
      {...handlers}
      style={{ ...BUTTON_RESET, flexGrow: 1 }}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          gap: compact ? S[200] : S[400],
          padding: compact ? S[200] : S[300],
          borderRadius: R.stage,
          backgroundColor: hovered ? colors.card : subtle,
          boxShadow: hovered ? shadow(colors, 'overlay') : insetRing(colors.hairline),
          ...focusRing(colors, focused),
          ...transition('background-color, box-shadow, transform', reduced, 300),
          transform: `translateY(${lift ? -2 : 0}px) scale(${scale})`,
        }}
      >
        <span
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              width: 32,
              height: 32,
              borderRadius: R.pill,
              backgroundColor: colors.card,
              boxShadow: insetRing(colors.hairline),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UiText variant="labelSm" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              {String(index + 1).padStart(2, '0')}
            </UiText>
          </span>
          <UiText variant="label" tone={hovered ? 'ink' : 'tertiary'} aria-hidden>
            →
          </UiText>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}>
          <UiText variant="titleSm">{item.title}</UiText>
          <UiText variant="bodySm" tone="secondary" numberOfLines={2}>
            {item.hint}
          </UiText>
        </span>
      </span>
    </button>
  );
}
