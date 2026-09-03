import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { AnimatedPressable } from './AnimatedPressable';

describe('AnimatedPressable', () => {
  it('keeps layout and hit-target styles on the element that handles presses', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <AnimatedPressable testID="target" style={{ minHeight: 72, flexDirection: 'row' }}>
          <Text>Open</Text>
        </AnimatedPressable>,
      );
    });

    const target = tree!.root.findByProps({ testID: 'target' });
    expect(StyleSheet.flatten(target.props.style)).toEqual(expect.objectContaining({
      minHeight: 72,
      flexDirection: 'row',
    }));
  });

  it('shows an accent focus ring for keyboard focus and clears it on blur', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <AnimatedPressable testID="target">
          <Text>Open</Text>
        </AnimatedPressable>,
      );
    });

    // `findByProps` hits the outer function element first, which carries
    // no handlers; drive focus through the inner pressable that owns
    // the wrapper's onFocus/onBlur and the style array. Assert on the
    // array entries directly: flattening would drag the Animated scale
    // value into jest's serializer.
    const pressable = () => tree!.root
      .findAllByProps({ testID: 'target' })
      .find((node) => Array.isArray(node.props.style))!;
    act(() => {
      pressable().props.onFocus?.({});
    });
    expect(pressable().props.style as unknown[]).toEqual(expect.arrayContaining([expect.objectContaining({
      outlineWidth: 2,
      outlineOffset: 2,
    })]));

    act(() => {
      pressable().props.onBlur?.({});
    });
    const afterStyles = pressable().props.style as unknown[];
    expect(afterStyles.filter((entry) => typeof entry === 'object' && entry !== null && 'outlineWidth' in entry)).toHaveLength(0);
  });
});
