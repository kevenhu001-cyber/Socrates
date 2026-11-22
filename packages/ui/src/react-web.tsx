import React, { forwardRef, type ReactNode } from 'react';

export type FontVariant = string | string[];

export type ViewStyle = Record<string, unknown>;
export type TextStyle = Record<string, unknown>;
export type ImageStyle = Record<string, unknown>;

export type RecursiveArray<T> = Array<T | RecursiveArray<T> | null | undefined | false>;
export type StyleProp<T = unknown> = unknown;

export type PressableStateCallbackType = {
  pressed: boolean;
  hovered?: boolean;
  focused?: boolean;
};

export type DataSet = Record<string, string | number | boolean | undefined | null>;

export interface PressableProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'style' | 'children'
> {
  onPress?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPressIn?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPressOut?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onHoverIn?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onHoverOut?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: unknown;
  testID?: string;
  nativeID?: string;
  focusable?: boolean;
  hitSlop?: unknown;
  role?: string;
  dataSet?: DataSet;
  style?: unknown | ((state: PressableStateCallbackType) => unknown);
  children?: ReactNode | ((state: PressableStateCallbackType) => ReactNode);
}

export interface TextProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  testID?: string;
  nativeID?: string;
  dataSet?: DataSet;
  numberOfLines?: number;
  ellipsizeMode?: string;
  selectable?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  role?: string;
  style?: unknown;
}

export interface ViewProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  testID?: string;
  nativeID?: string;
  dataSet?: DataSet;
  style?: unknown;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityState?: unknown;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
  onLayout?: (event: LayoutChangeEvent) => void;
  hitSlop?: unknown;
}

export interface SwitchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'style' | 'value'
> {
  value?: boolean;
  onValueChange?: (val: boolean) => void;
  trackColor?: { false?: string; true?: string };
  thumbColor?: string;
  style?: unknown;
  testID?: string;
  nativeID?: string;
  accessibilityLabel?: string;
  dataSet?: DataSet;
}

export type LayoutChangeEvent = {
  nativeEvent: {
    layout: { x: number; y: number; width: number; height: number };
  };
};

export type GestureResponderEvent = React.SyntheticEvent;

export type PanResponderGestureState = {
  stateID: number;
  moveX: number;
  moveY: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  numberActiveTouches: number;
};

export type PanResponderCallbacks = {
  onStartShouldSetPanResponder?: (
    event: GestureResponderEvent,
    gestureState: PanResponderGestureState,
  ) => boolean;
  onMoveShouldSetPanResponder?: (
    event: GestureResponderEvent,
    gestureState: PanResponderGestureState,
  ) => boolean;
  onPanResponderGrant?: (
    event: GestureResponderEvent,
    gestureState: PanResponderGestureState,
  ) => void;
  onPanResponderMove?: (
    event: GestureResponderEvent,
    gestureState: PanResponderGestureState,
  ) => void;
  onPanResponderRelease?: (
    event: GestureResponderEvent,
    gestureState: PanResponderGestureState,
  ) => void;
  onPanResponderTerminate?: (
    event: GestureResponderEvent,
    gestureState: PanResponderGestureState,
  ) => void;
};

export class AnimatedValue {
  _val: number;
  constructor(v: number) {
    this._val = v;
  }
  setValue(v: number) {
    this._val = v;
  }
  interpolate(_config: unknown) {
    return this._val;
  }
  stopAnimation(cb?: (val: number) => void) {
    cb?.(this._val);
  }
  addListener(_cb: unknown) {
    return '0';
  }
  removeListener(_id: unknown) {}
}

function extractClassNames(style: unknown, classes: string[] = []): string[] {
  if (!style) return classes;
  if (Array.isArray(style)) {
    for (const item of style) extractClassNames(item, classes);
    return classes;
  }
  if (typeof style === 'object') {
    const obj = style as Record<string, unknown>;
    if (obj.$$css) {
      for (const [k, v] of Object.entries(obj)) {
        if (k !== '$$css' && typeof v === 'string') classes.push(v);
      }
    }
    if (typeof obj.className === 'string') classes.push(obj.className);
  }
  return classes;
}

export function flattenStyle(style: unknown): React.CSSProperties {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<React.CSSProperties>(
      (acc, cur) => Object.assign(acc, flattenStyle(cur)),
      {},
    );
  }
  if (typeof style === 'object') {
    const res: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(style as Record<string, unknown>)) {
      if (key === '$$css' || key === 'socratesHost') continue;
      if (val instanceof AnimatedValue) {
        res[key] = val._val;
      } else if (key === 'transform' && Array.isArray(val)) {
        res[key] = val
          .map((t: Record<string, unknown>) => {
            const entries = Object.entries(t);
            if (!entries.length) return '';
            const [k, v] = entries[0];
            const num = typeof v === 'number' && k.includes('rotate') ? `${v}deg` : v;
            return `${k}(${num})`;
          })
          .filter(Boolean)
          .join(' ');
      } else if (key === 'fontVariant' && Array.isArray(val)) {
        res.fontVariantNumeric = val.join(' ');
      } else {
        res[key] = val;
      }
    }
    return res as React.CSSProperties;
  }
  return style as React.CSSProperties;
}

export function resolveStyleAndClass(style: unknown, baseClassName?: string) {
  const extraClasses = extractClassNames(style);
  const flat = flattenStyle(style);
  const all = [baseClassName, ...extraClasses].filter(Boolean).join(' ');
  return {
    style: Object.keys(flat).length ? flat : undefined,
    className: all || undefined,
  };
}

/**
 * react-native-web maps the `dataSet` prop to `data-*` attributes. The local
 * shim has to do the same: spreading `dataSet` onto a DOM node renders
 * `dataset="[object Object]"` and every `[data-…]` selector in the app and its
 * e2e specs silently stops matching.
 */
export function dataAttributes(
  dataSet?: Record<string, string | number | boolean | undefined | null>,
): Record<string, string> {
  if (!dataSet) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dataSet)) {
    if (value === undefined || value === null) continue;
    out[`data-${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`] = String(value);
  }
  return out;
}

export const StyleSheet = {
  create<T extends Record<string, unknown>>(styles: T): T {
    return styles;
  },
  flatten(style: unknown): React.CSSProperties {
    return flattenStyle(style);
  },
};

export const Platform = {
  OS: 'web' as const,
  select: <T,>(obj: { web?: T; default?: T; [key: string]: unknown }): T =>
    (obj.web ?? obj.default) as T,
};

export type View = HTMLElement;
export const View = forwardRef<HTMLDivElement, ViewProps>(function View(
  { style, className, testID, nativeID, id, dataSet, ...props },
  ref,
) {
  const resolved = resolveStyleAndClass(style, className);
  /* RN's View is a flex column by default. A plain <div> is block, which
     stacked the composer rail and every other row that relied on the
     default — restore the RN base before the caller's own style. */
  const base: React.CSSProperties = { display: 'flex', flexDirection: 'column' };
  return (
    <div
      ref={ref}
      id={nativeID || id}
      data-testid={testID}
      style={{ ...base, ...resolved.style }}
      className={resolved.className}
      {...dataAttributes(dataSet)}
      {...props}
    />
  );
});

export type Text = HTMLSpanElement;
export const Text = forwardRef<HTMLSpanElement, TextProps>(function Text(
  {
    style,
    className,
    testID,
    nativeID,
    id,
    numberOfLines,
    ellipsizeMode: _e,
    selectable: _s,
    dataSet,
    ...props
  },
  ref,
) {
  const resolved = resolveStyleAndClass(style, className);
  const clampStyle: React.CSSProperties | undefined = numberOfLines
    ? {
        display: '-webkit-box',
        WebkitLineClamp: numberOfLines,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }
    : undefined;
  const mergedStyle = clampStyle ? { ...resolved.style, ...clampStyle } : resolved.style;
  return (
    <span
      ref={ref}
      id={nativeID || id}
      data-testid={testID}
      style={mergedStyle}
      className={resolved.className}
      {...dataAttributes(dataSet)}
      {...props}
    />
  );
});

export type Pressable = HTMLButtonElement;
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  {
    style,
    className,
    onPress,
    onPressIn,
    onPressOut,
    onHoverIn,
    onHoverOut,
    disabled,
    testID,
    nativeID,
    id,
    focusable,
    tabIndex,
    children,
    dataSet,
    ...props
  },
  ref,
) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const resolvedStyle =
    typeof style === 'function'
      ? (style as (state: PressableStateCallbackType) => unknown)({ hovered, pressed })
      : style;
  const content = typeof children === 'function' ? children({ hovered, pressed }) : children;
  const resolved = resolveStyleAndClass(resolvedStyle, className);

  return (
    <button
      type="button"
      ref={ref}
      id={nativeID || id}
      disabled={disabled}
      tabIndex={focusable === false ? -1 : tabIndex}
      data-testid={testID}
      onClick={onPress}
      onMouseDown={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onMouseUp={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      onMouseEnter={(e) => {
        setHovered(true);
        onHoverIn?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        setPressed(false);
        onHoverOut?.(e);
      }}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        textAlign: 'inherit',
        font: 'inherit',
        color: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        ...resolved.style,
      }}
      className={resolved.className}
      {...dataAttributes(dataSet)}
      {...props}
    >
      {content}
    </button>
  );
});

export interface ScrollViewProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  contentContainerStyle?: unknown;
  style?: unknown;
  testID?: string;
  nativeID?: string;
  horizontal?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  keyboardShouldPersistTaps?: string;
  dataSet?: DataSet;
}

export type ScrollView = HTMLDivElement;
export const ScrollView = forwardRef<HTMLDivElement, ScrollViewProps>(function ScrollView(
  {
    style,
    className,
    contentContainerStyle,
    children,
    testID,
    nativeID,
    id,
    horizontal: _h,
    showsHorizontalScrollIndicator: _shi,
    showsVerticalScrollIndicator: _svi,
    keyboardShouldPersistTaps: _k,
    dataSet,
    ...props
  },
  ref,
) {
  const resolved = resolveStyleAndClass(style, className);
  const innerResolved = resolveStyleAndClass(contentContainerStyle);
  return (
    <div
      ref={ref}
      id={nativeID || id}
      data-testid={testID}
      style={{ overflow: 'auto', ...resolved.style }}
      className={resolved.className}
      {...dataAttributes(dataSet)}
      {...props}
    >
      <div style={innerResolved.style} className={innerResolved.className}>
        {children}
      </div>
    </div>
  );
});

export interface TextInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'style' | 'value'
> {
  style?: unknown;
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  multiline?: boolean;
  numberOfLines?: number;
  textAlignVertical?: string;
  editable?: boolean;
  testID?: string;
  nativeID?: string;
  dataSet?: DataSet;
}

export type TextInput = HTMLInputElement;
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    style,
    className,
    value,
    onChangeText,
    placeholder,
    placeholderTextColor: _ptc,
    multiline,
    numberOfLines: _n,
    textAlignVertical: _t,
    editable,
    testID,
    nativeID,
    id,
    dataSet,
    ...props
  },
  ref,
) {
  const isReadOnly = editable === false;
  const resolved = resolveStyleAndClass(style, className);
  if (multiline) {
    return (
      <textarea
        ref={ref as unknown as React.Ref<HTMLTextAreaElement>}
        id={nativeID || id}
        data-testid={testID}
        value={value}
        readOnly={isReadOnly}
        onChange={(e) => onChangeText?.(e.target.value)}
        placeholder={placeholder}
        style={resolved.style}
        className={resolved.className}
        {...dataAttributes(dataSet)}
        {...(props as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    );
  }
  return (
    <input
      ref={ref}
      id={nativeID || id}
      data-testid={testID}
      value={value}
      readOnly={isReadOnly}
      onChange={(e) => onChangeText?.(e.target.value)}
      placeholder={placeholder}
      style={resolved.style}
      className={resolved.className}
      {...dataAttributes(dataSet)}
      {...props}
    />
  );
});

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    value,
    className,
    onValueChange,
    disabled,
    style,
    testID,
    nativeID,
    id,
    accessibilityLabel,
    dataSet,
    ...props
  },
  ref,
) {
  const resolved = resolveStyleAndClass(style, className);
  return (
    <input
      type="checkbox"
      ref={ref}
      id={nativeID || id}
      data-testid={testID}
      aria-label={accessibilityLabel}
      checked={!!value}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.checked)}
      style={{ cursor: disabled ? 'default' : 'pointer', ...resolved.style }}
      className={resolved.className}
      {...dataAttributes(dataSet)}
      {...props}
    />
  );
});

export interface ModalProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  visible?: boolean;
  style?: unknown;
  children?: ReactNode;
  testID?: string;
  nativeID?: string;
  transparent?: boolean;
  animationType?: string;
  dataSet?: DataSet;
  onRequestClose?: () => void;
}

export const Modal = function Modal({
  visible = true,
  children,
  style,
  className,
  testID,
  nativeID,
  id,
  transparent: _tr,
  animationType: _at,
  onRequestClose: _orc,
  dataSet,
  ...props
}: ModalProps) {
  if (!visible) return null;
  const resolved = resolveStyleAndClass(style, className);
  return (
    <div
      id={nativeID || id}
      data-testid={testID}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, ...resolved.style }}
      className={resolved.className}
      {...dataAttributes(dataSet)}
      {...props}
    >
      {children}
    </div>
  );
};

export interface ImageLoadEvent {
  nativeEvent: {
    width?: number;
    height?: number;
    source?: {
      width?: number;
      height?: number;
      uri?: string;
    };
  };
}

export interface ImageProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'style' | 'source' | 'onLoad'
> {
  source?: string | { uri?: string };
  style?: unknown;
  onLoad?: (event: ImageLoadEvent) => void;
  testID?: string;
  nativeID?: string;
  accessibilityLabel?: string;
  accessibilityIgnoresInvertColors?: boolean;
  resizeMode?: string;
  dataSet?: DataSet;
}

export const Image = function Image({
  source,
  style,
  className,
  onLoad,
  testID,
  nativeID,
  id,
  accessibilityLabel,
  accessibilityIgnoresInvertColors: _aiic,
  resizeMode: _r,
  dataSet,
  ...props
}: ImageProps) {
  const src = typeof source === 'string' ? source : source?.uri;
  const resolved = resolveStyleAndClass(style, className);
  return (
    <img
      id={nativeID || id}
      data-testid={testID}
      aria-label={accessibilityLabel}
      src={src}
      style={resolved.style}
      className={resolved.className}
      {...dataAttributes(dataSet)}
      onLoad={(e) => {
        const target = e.target as HTMLImageElement;
        onLoad?.({
          nativeEvent: {
            width: target.naturalWidth || 100,
            height: target.naturalHeight || 100,
            source: {
              width: target.naturalWidth || 100,
              height: target.naturalHeight || 100,
              uri: src,
            },
          },
        });
      }}
      {...props}
      alt={accessibilityLabel || ''}
    />
  );
};

export function useWindowDimensions() {
  return { width: 1280, height: 800 };
}

const quad = (t: number) => t * t;
const cubic = (t: number) => t * t * t;

export const Easing = {
  linear: (t: number) => t,
  ease: (t: number) => t,
  quad,
  cubic,
  in: (fn: (t: number) => number) => fn,
  out: (fn: (t: number) => number) => (t: number) => 1 - fn(1 - t),
  inOut: (fn: (t: number) => number) => (t: number) =>
    t < 0.5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2,
  bezier: () => (t: number) => t,
};

export class AnimatedValueXY {
  x: AnimatedValue;
  y: AnimatedValue;
  constructor(value?: { x: number; y: number }) {
    this.x = new AnimatedValue(value?.x || 0);
    this.y = new AnimatedValue(value?.y || 0);
  }
  setValue(v: { x: number; y: number }) {
    this.x.setValue(v.x);
    this.y.setValue(v.y);
  }
  setOffset(_v: { x: number; y: number }) {}
  flattenOffset() {}
  stopAnimation(cb?: (val: { x: number; y: number }) => void) {
    cb?.({ x: this.x._val, y: this.y._val });
  }
  getLayout() {
    return { left: this.x._val, top: this.y._val };
  }
  getTranslateTransform() {
    return [{ translateX: this.x }, { translateY: this.y }];
  }
}

export type CompositeAnimation = {
  start: (cb?: (result: { finished: boolean }) => void) => void;
  stop: () => void;
};

export const Animated = {
  Value: AnimatedValue,
  ValueXY: AnimatedValueXY,
  timing: (
    value: unknown,
    config: { toValue?: number; [key: string]: unknown },
  ): CompositeAnimation => ({
    start: (cb?: (result: { finished: boolean }) => void) => {
      if (
        value &&
        typeof (value as { setValue: (v: number) => void }).setValue === 'function' &&
        config?.toValue !== undefined
      ) {
        (value as { setValue: (v: number) => void }).setValue(config.toValue);
      }
      cb?.({ finished: true });
    },
    stop: () => {},
  }),
  spring: (
    value: unknown,
    config: { toValue?: number; [key: string]: unknown },
  ): CompositeAnimation => ({
    start: (cb?: (result: { finished: boolean }) => void) => {
      if (
        value &&
        typeof (value as { setValue: (v: number) => void }).setValue === 'function' &&
        config?.toValue !== undefined
      ) {
        (value as { setValue: (v: number) => void }).setValue(config.toValue);
      }
      cb?.({ finished: true });
    },
    stop: () => {},
  }),
  loop: (_animation: unknown, _config?: unknown): CompositeAnimation => ({
    start: (cb?: (result: { finished: boolean }) => void) => cb?.({ finished: true }),
    stop: () => {},
  }),
  sequence: (_animations: unknown[]): CompositeAnimation => ({
    start: (cb?: (result: { finished: boolean }) => void) => cb?.({ finished: true }),
    stop: () => {},
  }),
  parallel: (_animations: unknown[]): CompositeAnimation => ({
    start: (cb?: (result: { finished: boolean }) => void) => cb?.({ finished: true }),
    stop: () => {},
  }),
  stagger: (_time: number, _animations: unknown[]): CompositeAnimation => ({
    start: (cb?: (result: { finished: boolean }) => void) => cb?.({ finished: true }),
    stop: () => {},
  }),
  View: View,
  Text: Text,
};

export namespace Animated {
  export type Value = AnimatedValue;
  export type ValueXY = AnimatedValueXY;
  export type CompositeAnimation = {
    start: (cb?: (result: { finished: boolean }) => void) => void;
    stop: () => void;
  };
}

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: (_event: string, _handler: unknown) => ({ remove: () => {} }),
  removeEventListener: (_event: string, _handler: unknown) => {},
};

export const PanResponder = {
  create: (_config: PanResponderCallbacks) => ({ panHandlers: {} }),
};

// Standard SVG elements for web
export const Svg = forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  function Svg(props, ref) {
    return <svg ref={ref} {...props} />;
  },
);
export const Path = (props: React.SVGProps<SVGPathElement>) => <path {...props} />;
export const Rect = (props: React.SVGProps<SVGRectElement>) => <rect {...props} />;
export const Circle = (props: React.SVGProps<SVGCircleElement>) => <circle {...props} />;
export const Line = (props: React.SVGProps<SVGLineElement>) => <line {...props} />;
export const Polyline = (props: React.SVGProps<SVGPolylineElement>) => <polyline {...props} />;
export default Svg;
