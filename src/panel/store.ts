import { create } from 'zustand';

import type { ProviderRuntimeView, ProviderState, StreamEvent } from '../lib/bridge-protocol';
import type { ProviderId } from '../lib/types';

interface PanelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface PanelState {
  activeRequestId?: string;
  connected: boolean;
  draft: string;
  messages: PanelMessage[];
  pageLabel: string;
  providers: ProviderRuntimeView[];
  selectedTextProviderId?: ProviderId;
  selectedVisionProviderId?: ProviderId;
  setConnected(connected: boolean): void;
  setDraft(draft: string): void;
  addUserMessage(content: string): void;
  applyProviderState(state: ProviderState): void;
  applyStreamEvent(event: StreamEvent): void;
  selectTextProvider(providerId: ProviderId): void;
  selectVisionProvider(providerId: ProviderId): void;
}

export const usePanelStore = create<PanelState>((set) => ({
  connected: false,
  draft: '',
  messages: [],
  pageLabel: '等待读取当前 GitHub 页面',
  providers: [],
  setConnected: (connected) => set({ connected }),
  setDraft: (draft) => set({ draft }),
  addUserMessage: (content) =>
    set((state) => ({
      draft: '',
      messages: [...state.messages, { id: crypto.randomUUID(), role: 'user', content }],
    })),
  applyProviderState: ({ providers }) =>
    set((state) => ({
      providers,
      selectedTextProviderId:
        state.selectedTextProviderId ??
        providers.find((provider) => provider.id === 'deepseek')?.id,
      selectedVisionProviderId:
        state.selectedVisionProviderId ??
        providers.find(
          (provider) =>
            provider.availability === 'available' && provider.capabilities.supportsVision,
        )?.id ??
        providers.find((provider) => provider.id === 'uuapi')?.id,
    })),
  selectTextProvider: (selectedTextProviderId) => set({ selectedTextProviderId }),
  selectVisionProvider: (selectedVisionProviderId) => set({ selectedVisionProviderId }),
  applyStreamEvent: (event) =>
    set((state) => {
      if (event.kind === 'start') {
        return {
          activeRequestId: event.requestId,
          messages: [...state.messages, { id: event.requestId, role: 'assistant', content: '' }],
        };
      }
      if (event.kind === 'context' && event.text) {
        return { pageLabel: event.text };
      }
      if (event.kind === 'delta' && event.text) {
        return {
          messages: state.messages.map((message) =>
            message.id === event.requestId
              ? { ...message, content: message.content + event.text }
              : message,
          ),
        };
      }
      if (event.kind === 'error' && event.text) {
        const exists = state.messages.some((message) => message.id === event.requestId);
        return {
          activeRequestId: undefined,
          messages: exists
            ? state.messages.map((message) =>
                message.id === event.requestId ? { ...message, content: event.text! } : message,
              )
            : [...state.messages, { id: event.requestId, role: 'assistant', content: event.text }],
        };
      }
      if (event.kind === 'done') {
        return { activeRequestId: undefined };
      }
      return state;
    }),
}));
