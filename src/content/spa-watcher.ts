export type SpaChangeReason = 'initial' | 'history' | 'popstate' | 'turbo' | 'mutation';

export interface SpaWatcherCallbacks {
  onRefresh(reason: SpaChangeReason, url: string): void;
  onInvalidate(previousUrl: string, nextUrl: string): void;
}

export interface SpaWatcherClock {
  set(callback: () => void, delayMs: number): unknown;
  clear(timer: unknown): void;
}

const browserClock: SpaWatcherClock = {
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (timer) => window.clearTimeout(timer as number),
};

export class SpaRefreshCoordinator {
  private currentUrl = '';
  private started = false;
  private timer: unknown;

  constructor(
    private readonly getUrl: () => string,
    private readonly callbacks: SpaWatcherCallbacks,
    private readonly delayMs = 300,
    private readonly clock: SpaWatcherClock = browserClock,
  ) {}

  start(): boolean {
    if (this.started) {
      return false;
    }
    this.started = true;
    this.currentUrl = this.getUrl();
    this.schedule('initial');
    return true;
  }

  signal(reason: SpaChangeReason, force = false): void {
    if (!this.started) {
      return;
    }
    const nextUrl = this.getUrl();
    const changed = nextUrl !== this.currentUrl;
    if (!changed && !force) {
      return;
    }
    if (changed) {
      this.callbacks.onInvalidate(this.currentUrl, nextUrl);
      this.currentUrl = nextUrl;
    }
    this.schedule(reason);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    if (this.timer !== undefined) {
      this.clock.clear(this.timer);
      this.timer = undefined;
    }
  }

  private schedule(reason: SpaChangeReason): void {
    if (this.timer !== undefined) {
      this.clock.clear(this.timer);
    }
    this.timer = this.clock.set(() => {
      this.timer = undefined;
      if (this.started) {
        this.callbacks.onRefresh(reason, this.currentUrl);
      }
    }, this.delayMs);
  }
}

export interface GitHubSpaWatcher {
  coordinator: SpaRefreshCoordinator;
  stop(): void;
}

const GLOBAL_WATCHER_KEY = '__gitHelperGitHubSpaWatcherV1';

export function startGitHubSpaWatcher(callbacks: SpaWatcherCallbacks): GitHubSpaWatcher {
  const globalState = window as unknown as Record<string, unknown>;
  const existing = globalState[GLOBAL_WATCHER_KEY] as GitHubSpaWatcher | undefined;
  if (existing) {
    return existing;
  }

  const coordinator = new SpaRefreshCoordinator(() => window.location.href, callbacks);
  const onPopState = (): void => coordinator.signal('popstate');
  const onTurbo = (): void => coordinator.signal('turbo', true);
  window.addEventListener('popstate', onPopState);
  document.addEventListener('turbo:load', onTurbo);
  document.addEventListener('turbo:render', onTurbo);

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = (...args): void => {
    originalPushState(...args);
    coordinator.signal('history');
  };
  history.replaceState = (...args): void => {
    originalReplaceState(...args);
    coordinator.signal('history');
  };

  const observer = new MutationObserver(() => coordinator.signal('mutation'));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  coordinator.start();

  const watcher: GitHubSpaWatcher = {
    coordinator,
    stop() {
      coordinator.stop();
      observer.disconnect();
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('turbo:load', onTurbo);
      document.removeEventListener('turbo:render', onTurbo);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      delete globalState[GLOBAL_WATCHER_KEY];
    },
  };
  globalState[GLOBAL_WATCHER_KEY] = watcher;
  return watcher;
}
