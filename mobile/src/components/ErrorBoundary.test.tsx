import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ErrorBoundary>
          <Text>Healthy content</Text>
        </ErrorBoundary>
      );
    });
    expect(tree!.root.findByType(Text).props.children).toBe('Healthy content');
  });

  it('renders fallback when an error occurs in state', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ErrorBoundary fallback={<Text>Custom fallback</Text>}>
          <Text>Normal child</Text>
        </ErrorBoundary>
      );
    });
    const instance = tree!.root.instance as ErrorBoundary;
    act(() => {
      instance.setState({ hasError: true, error: new Error('Simulated failure') });
    });
    expect(tree!.root.findByType(Text).props.children).toBe('Custom fallback');
  });

  it('renders default fallback UI and resets error on button press', () => {
    const onReset = jest.fn();
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ErrorBoundary onReset={onReset}>
          <Text>Normal child</Text>
        </ErrorBoundary>
      );
    });
    const instance = tree!.root.instance as ErrorBoundary;
    act(() => {
      instance.setState({ hasError: true, error: new Error('Render failed') });
    });
    const texts = tree!.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Something went wrong');

    act(() => {
      instance.resetError();
    });
    expect(onReset).toHaveBeenCalled();
    expect(instance.state.hasError).toBe(false);
  });
});

