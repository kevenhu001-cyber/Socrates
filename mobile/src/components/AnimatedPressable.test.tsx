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
});
