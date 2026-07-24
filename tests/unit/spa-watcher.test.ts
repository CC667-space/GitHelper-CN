import { describe, expect, it, vi } from 'vitest';

import { SpaRefreshCoordinator, type SpaWatcherClock } from '../../src/content/spa-watcher';

describe('SpaRefreshCoordinator', () => {
  it('幂等启动并将连续路由变化去抖为一次刷新', () => {
    vi.useFakeTimers();
    let url = 'https://github.com/octocat/demo';
    const onRefresh = vi.fn();
    const onInvalidate = vi.fn();
    const clock: SpaWatcherClock = {
      set: (callback, delay) => setTimeout(callback, delay),
      clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    };
    const watcher = new SpaRefreshCoordinator(() => url, { onRefresh, onInvalidate }, 300, clock);

    expect(watcher.start()).toBe(true);
    expect(watcher.start()).toBe(false);
    url = 'https://github.com/octocat/demo/issues/1';
    watcher.signal('history');
    url = 'https://github.com/octocat/demo/issues/2';
    watcher.signal('turbo', true);
    watcher.signal('mutation');

    vi.advanceTimersByTime(299);
    expect(onRefresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenLastCalledWith('turbo', url);
    expect(onInvalidate).toHaveBeenCalledTimes(2);
    watcher.stop();
    vi.useRealTimers();
  });

  it('同 URL 的普通 DOM mutation 不重复刷新，Turbo 可强制刷新', () => {
    vi.useFakeTimers();
    const url = 'https://github.com/octocat/demo';
    const onRefresh = vi.fn();
    const watcher = new SpaRefreshCoordinator(
      () => url,
      { onRefresh, onInvalidate: vi.fn() },
      300,
      {
        set: (callback, delay) => setTimeout(callback, delay),
        clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      },
    );
    watcher.start();
    vi.advanceTimersByTime(300);
    watcher.signal('mutation');
    vi.advanceTimersByTime(300);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    watcher.signal('turbo', true);
    vi.advanceTimersByTime(300);
    expect(onRefresh).toHaveBeenCalledTimes(2);
    watcher.stop();
    vi.useRealTimers();
  });
});
