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
 * with the host, which passes strings and callbacks — so the same component
 * mounts in the web shell and, later, in apps/socrates.
 *
 * Motion: the suggestions rise in once, staggered, when they first appear or
 * when the mode swaps their content. That is the only movement; it tells the
 * reader the entries are new. Reduced-motion users get them in place.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { uiMotion, uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiButton, usePressFeedback } from '../primitives/UiButton';
import { UiIcon, type UiGlyphName } from '../primitives/UiIcon';
import { useReducedMotion } from '../turn/parts';
import { R, S, focusRing, insetRing, shadow, sheets, transition } from '../look';

/** Below this width the layout switches to the phone composition. */
export const HOME_COMPACT_WIDTH = 769;

/** RN typings lack `aria-level`; React Native Web reads it to pick h1–h6. */
function headingLevel(level: number): object {
  return { 'aria-level': level };
}

export interface HomeHeroProps {
  title: string;
  /** Short line under the title. Omit to show the title alone. */
  subtitle?: string;
  /** DOM id on web (`nativeID`), kept for hosts that address the title. */
  titleId?: string;
}

export function HomeHero({ title, subtitle, titleId }: HomeHeroProps) {
  const { width } = useWindowDimensions();
  const compact = width < HOME_COMPACT_WIDTH;
  return (
    <View style={{ alignItems: 'center', gap: uiSpace[3], paddingHorizontal: compact ? uiSpace[2] : 0 }}>
      <UiText
        nativeID={titleId}
        role="heading"
        {...headingLevel(1)}
        variant={compact ? 'greetingCompact' : 'greeting'}
        style={compact ? { fontWeight: '400' } : undefined}
        align="center"
      >
        {title}
      </UiText>
      {subtitle ? (
        <UiText variant={compact ? 'bodySm' : 'body'} tone="secondary" align="center">{subtitle}</UiText>
      ) : null}
    </View>
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

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduce(value); }, () => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}

/** Staggered rise-in for `count` children, replayed when `replayKey` changes. */
function useEntrance(count: number, replayKey: string) {
  const reduce = useReduceMotion();
  const values = useRef<Animated.Value[]>([]);
  while (values.current.length < count) values.current.push(new Animated.Value(1));
  useEffect(() => {
    if (reduce) {
      values.current.forEach((value) => value.setValue(1));
      return undefined;
    }
    const native = Platform.OS !== 'web';
    values.current.forEach((value) => value.setValue(0));
    const animation = Animated.stagger(60, values.current.slice(0, count).map((value) => Animated.timing(value, {
      toValue: 1,
      duration: uiMotion.enter,
      useNativeDriver: native,
    })));
    animation.start();
    return () => animation.stop();
  }, [count, replayKey, reduce]);
  return (index: number) => {
    const value = values.current[index];
    return {
      opacity: value,
      transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
    };
  };
}

export interface HomeShortcutsProps {
  items: readonly HomeShortcut[];
  onSelect: (id: string) => void;
  onDismiss: (id: string) => void;
  dismissLabel: string;
  /** Group label for assistive tech. */
  label: string;
}

/** Chat mode: a centred row of pale grey capsules, each with a quiet dismiss. */
export function HomeShortcuts({ items, onSelect, onDismiss, dismissLabel, label }: HomeShortcutsProps) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const compact = width < HOME_COMPACT_WIDTH;
  const enter = useEntrance(items.length, 'shortcuts');
  return (
    <View
      role="group"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        flexWrap: compact ? 'nowrap' : 'wrap',
        justifyContent: compact ? 'flex-start' : 'center',
        gap: uiSpace[2],
      }}
    >
      {items.map((item, index) => (
        <Animated.View
          key={item.id}
          testID={`home-shortcut-${item.id}`}
          style={[{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: uiRadius.pill,
            backgroundColor: item.pressed ? colors.ink : colors.fill,
          }, enter(index)]}
        >
          <UiButton
            testID={`home-shortcut-action-${item.id}`}
            label={item.label}
            variant={item.pressed ? 'primary' : 'ghost'}
            size={compact ? 'sm' : 'md'}
            leading={item.icon ? <UiIcon name={item.icon} size={compact ? 16 : 18} color={item.pressed ? colors.onInk : colors.inkSecondary} /> : undefined}
            {...(item.pressed === undefined ? {} : { 'aria-pressed': item.pressed })}
            onPress={() => onSelect(item.id)}
          />
          {/* Touch has no hover, so phones drop the dismiss (it would only be
              reachable by a long-press that also opens the context menu). */}
          {compact ? null : <Pressable
            testID={`home-shortcut-dismiss-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
            onPress={() => onDismiss(item.id)}
            hitSlop={6}
            style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => ({
              width: 24,
              height: 24,
              marginRight: uiSpace[2],
              marginLeft: -uiSpace[1],
              borderRadius: uiRadius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.fillPressed : hovered ? colors.fillHover : 'transparent',
              outlineStyle: focused ? 'solid' : undefined,
              outlineWidth: focused ? 2 : 0,
              outlineColor: colors.ink,
              outlineOffset: 1,
            })}
          >
            {/* A real 14px line glyph: the bare "×" character rendered at
                label size read as a dot. */}
            <UiIcon name="close" size={14} color={item.pressed ? colors.onInk : colors.inkSecondary} />
          </Pressable>}
        </Animated.View>
      ))}
    </View>
  );
}

export interface HomeStartersProps {
  heading: string;
  headingId?: string;
  items: readonly HomeStarter[];
  onSelect: (id: string) => void;
}

/** Tutor mode: an eyebrow heading and three numbered cards. */
export function HomeStarters({ heading, headingId, items, onSelect }: HomeStartersProps) {
  const { width } = useWindowDimensions();
  const compact = width < HOME_COMPACT_WIDTH;
  const enter = useEntrance(items.length, 'starters');
  return (
    <View style={{ gap: compact ? uiSpace[3] : uiSpace[4] }}>
      <UiText nativeID={headingId} role="heading" {...headingLevel(2)} variant="labelSm" tone="tertiary" align={compact ? 'left' : 'center'}>
        {heading}
      </UiText>
      {compact ? (
        /* Phones scroll the cards sideways: three stacked cards would bury
           the composer on short screens. */
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: uiSpace[2] }}>
          {items.map((item, index) => (
            <Animated.View key={item.id} style={[{ width: Math.min(280, Math.round(width * 0.72)) }, enter(index)]}>
              <StarterCard item={item} index={index} compact onSelect={onSelect} />
            </Animated.View>
          ))}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row', gap: uiSpace[3] }}>
          {items.map((item, index) => (
            <Animated.View key={item.id} style={[{ flexGrow: 1, flexBasis: 0 }, enter(index)]}>
              <StarterCard item={item} index={index} compact={false} onSelect={onSelect} />
            </Animated.View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Starter card (site `.story-step` / `.m-card`): a #f9f9f9 sheet on a
 * hairline ring with a 24px radius, the index in a white ringed disc, the
 * title and one line of hint. Hover lifts it onto white with the site's
 * second shadow (`.news-item:hover`); reduced motion keeps it in place.
 */
function StarterCard({ item, index, compact, onSelect }: { item: HomeStarter; index: number; compact: boolean; onSelect: (id: string) => void }) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { subtle } = sheets(colors);
  const { scale, hovered, focused, handlers } = usePressFeedback();
  const lift = hovered && !reduced;
  return (
    <Pressable
      testID={`home-starter-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.hint}`}
      onPress={() => onSelect(item.id)}
      {...handlers}
      style={{ flexGrow: 1 }}
    >
      <Animated.View
        style={{
          flexGrow: 1,
          gap: compact ? S[200] : S[400],
          padding: compact ? S[200] : S[300],
          borderRadius: R.stage,
          backgroundColor: hovered ? colors.card : subtle,
          boxShadow: hovered ? shadow(colors, 'overlay') : insetRing(colors.hairline),
          ...focusRing(colors, focused),
          ...transition('background-color, box-shadow, transform', reduced, 300),
          transform: [{ translateY: lift ? -2 : 0 }, { scale }],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{
            width: 32,
            height: 32,
            borderRadius: R.pill,
            backgroundColor: colors.card,
            boxShadow: insetRing(colors.hairline),
            alignItems: 'center',
            justifyContent: 'center',
          }}
          >
            <UiText variant="labelSm" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>{String(index + 1).padStart(2, '0')}</UiText>
          </View>
          <UiText variant="label" tone={hovered ? 'ink' : 'tertiary'} aria-hidden>→</UiText>
        </View>
        <View style={{ gap: S[50] }}>
          <UiText variant="titleSm">{item.title}</UiText>
          <UiText variant="bodySm" tone="secondary" numberOfLines={2}>{item.hint}</UiText>
        </View>
      </Animated.View>
    </Pressable>
  );
}
