import React, { useCallback, useState } from 'react';
import { Image, StyleSheet, type LayoutChangeEvent, type ImageSourcePropType } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const RESET_DURATION = 180;

export interface ZoomableImageProps {
  /** Passed through to `Image.source` — supports `{ uri, headers }` for
   * authenticated file endpoints. */
  source: ImageSourcePropType;
  accessibilityLabel?: string;
  testID?: string;
}

type Size = { width: number; height: number };

function clampValue(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/**
 * Cross-platform pinch/double-tap/pan image zoom.
 *
 * Replaces `ScrollView maximumZoomScale`, which is iOS-only — on Android the
 * prop is ignored entirely. Built on react-native-gesture-handler +
 * react-native-reanimated so gestures run on the UI thread. The
 * `GestureHandlerRootView` wrapper is required because this renders inside a
 * `Modal` (`Overlay`), where no app-level gesture root exists on Android.
 */
export function ZoomableImage({ source, accessibilityLabel, testID }: ZoomableImageProps) {
  const [container, setContainer] = useState<Size | null>(null);
  const [imageSize, setImageSize] = useState<Size | null>(null);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainer({ width, height });
  }, []);

  const onImageLoad = useCallback(
    (event: { nativeEvent: { source: { width: number; height: number } } }) => {
      const { width, height } = event.nativeEvent.source;
      if (container && width > 0 && height > 0) {
        const fit = Math.min(container.width / width, container.height / height);
        setImageSize({ width: width * fit, height: height * fit });
      }
    },
    [container],
  );

  /* Largest translation that keeps the scaled image covering the container on
   * each axis; when the image is smaller than the container it stays centered. */
  const clampTranslation = (size: Size, s: number, tx: number, ty: number) => {
    'worklet';
    const maxX = Math.max(0, (size.width * s - size.width) / 2);
    const maxY = Math.max(0, (size.height * s - size.height) / 2);
    return {
      x: clampValue(tx, -maxX, maxX),
      y: clampValue(ty, -maxY, maxY),
    };
  };

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      if (!imageSize) return;
      const next = clampValue(savedScale.value * event.scale, MIN_SCALE, MAX_SCALE);
      // Keep the pinch focal point stationary relative to the scaled image:
      // tx = savedT + focal * (savedScale - next) / savedScale.
      const fx = event.focalX - imageSize.width / 2;
      const fy = event.focalY - imageSize.height / 2;
      const tx = savedX.value + (fx * (savedScale.value - next)) / savedScale.value;
      const ty = savedY.value + (fy * (savedScale.value - next)) / savedScale.value;
      scale.value = next;
      translationX.value = tx;
      translationY.value = ty;
    })
    .onEnd(() => {
      if (!imageSize) return;
      savedScale.value = scale.value;
      const clamped = clampTranslation(imageSize, scale.value, translationX.value, translationY.value);
      translationX.value = withTiming(clamped.x, { duration: RESET_DURATION });
      translationY.value = withTiming(clamped.y, { duration: RESET_DURATION });
      savedX.value = clamped.x;
      savedY.value = clamped.y;
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onUpdate((event) => {
      if (!imageSize || savedScale.value <= MIN_SCALE) return;
      translationX.value = savedX.value + event.translationX;
      translationY.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      if (!imageSize) return;
      const clamped = clampTranslation(imageSize, scale.value, translationX.value, translationY.value);
      translationX.value = withTiming(clamped.x, { duration: RESET_DURATION });
      translationY.value = withTiming(clamped.y, { duration: RESET_DURATION });
      savedX.value = clamped.x;
      savedY.value = clamped.y;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (!imageSize) return;
      if (savedScale.value > MIN_SCALE) {
        scale.value = withTiming(MIN_SCALE, { duration: RESET_DURATION });
        translationX.value = withTiming(0, { duration: RESET_DURATION });
        translationY.value = withTiming(0, { duration: RESET_DURATION });
        savedScale.value = MIN_SCALE;
        savedX.value = 0;
        savedY.value = 0;
        return;
      }
      const next = DOUBLE_TAP_SCALE;
      // Zoom toward the tapped point: (1 - s) * focal keeps it under the finger.
      const fx = event.x - imageSize.width / 2;
      const fy = event.y - imageSize.height / 2;
      const clamped = clampTranslation(imageSize, next, (1 - next) * fx, (1 - next) * fy);
      scale.value = withTiming(next, { duration: RESET_DURATION });
      translationX.value = withTiming(clamped.x, { duration: RESET_DURATION });
      translationY.value = withTiming(clamped.y, { duration: RESET_DURATION });
      savedScale.value = next;
      savedX.value = clamped.x;
      savedY.value = clamped.y;
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translationX.value },
      { translateY: translationY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onLayout} testID={testID}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.imageWrap, imageSize, animatedStyle]}>
          <Image
            source={source}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel={accessibilityLabel}
            onLoad={onImageLoad}
          />
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
