import { create } from 'zustand';

import type { StreamEvent } from '../lib/bridge-protocol';

interface PanelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface PanelState {
  connected: boolean;
  draft: string;
  messages: PanelMessage[];
  pageLabel: string;
  providerLabel: string;
  setConnected(connected: boolean): void;
  setDraft(draft: string): void;
  addUserMessage(content: string): void;
  applyStreamEvent(event: StreamEvent): void;
}

export const usePanelStore = create<PanelState>((set) => ({
  connected: false,
  draft: '',
  messages: [],
  pageLabel: '等待读取当前 GitHub 页面',
  providerLabel: 'Provider 尚未配置',
  setConnected: (connected) => set({ connected }),
  setDraft: (draft) => set({ draft }),
  addUserMessage: (content) =>
    set((state) => ({
      draft: '',
      messages: [...state.messages, { id: crypto.randomUUID(), role: 'user', content }],
    })),
  applyStreamEvent: (event) =>
    set((state) => {
      if (event.kind === 'context' && event.text) {
        return { pageLabel: event.text };
      }
      if ((event.kind === 'delta' || event.kind === 'error') && event.text) {
        return {
          messages: [
            ...state.messages,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: event.text,
            },
          ],
        };
      }
      return state;
    }),
}));
