import { dismissToast, getToast, showToast, subscribeToast } from './Toast';

describe('toast store', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    dismissToast();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows a toast and auto-dismisses it', () => {
    const id = showToast('Saved', 'success', 1000);
    expect(getToast()).toMatchObject({ id, message: 'Saved', type: 'success' });

    jest.advanceTimersByTime(999);
    expect(getToast()).not.toBeNull();

    jest.advanceTimersByTime(1);
    expect(getToast()).toBeNull();
  });

  it('replaces a pending toast and resets its timer', () => {
    showToast('First', 'info', 1000);
    jest.advanceTimersByTime(800);

    const id = showToast('Second', 'error', 1000);
    jest.advanceTimersByTime(800);
    expect(getToast()?.id).toBe(id);

    jest.advanceTimersByTime(200);
    expect(getToast()).toBeNull();
  });

  it('notifies subscribers and only dismisses the matching toast', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToast(listener);

    const id = showToast('Hi', 'info', 5000);
    expect(listener).toHaveBeenCalledTimes(1);

    dismissToast(id + 1);
    expect(getToast()).not.toBeNull();

    dismissToast(id);
    expect(getToast()).toBeNull();
    unsubscribe();
  });
});
