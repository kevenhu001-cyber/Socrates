import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders placeholder geometry on the shimmer token', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Skeleton testID="row" width={120} height={14} borderRadius={7} />);
    });

    const node = tree!.root.findAllByProps({ testID: 'row' }).find((entry) => entry.props.style !== undefined);
    expect(StyleSheet.flatten(node!.props.style)).toEqual(expect.objectContaining({
      width: 120,
      height: 14,
      borderRadius: 7,
    }));
  });
});
