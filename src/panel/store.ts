import { create } from 'zustand';

import type {
  PanelSessionState,
  PanelPickState,
  PanelRegionState,
  ProviderRuntimeView,
  ProviderState,
  StreamEvent,
} from '../lib/bridge-protocol';
import type { ProviderId } from '../lib/types';
import type { SelectedElement, SelectedRegion } from '../lib/types';

interface PanelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface PanelState {
  activeRequestId?: string;
  connected: boolean;
  draft: string;
  messages: PanelMessage[];
  sessionHistoryTruncated: boolean;
  sessionId?: string;
  pickStatus: 'idle' | 'active' | 'selected';
  pickStatusMessage?: string;
  selectedElement?: SelectedElement;
  regionStatus: 'idle' | 'active' | 'selected';
  regionStatusMessage?: string;
  selectedRegion?: SelectedRegion;
  pageLabel: string;
  providers: ProviderRuntimeView[];
  selectedTextProviderId?: ProviderId;
  selectedVisionProviderId?: ProviderId;
  setConnected(connected: boolean): void;
  setDraft(draft: string): void;
  addUserMessage(content: string): void;
  applyProviderState(state: ProviderState): void;
  applySessionState(state: PanelSessionState): void;
  applyPickState(state: PanelPickState): void;
  clearSelectedElement(): void;
  applyRegionState(state: PanelRegionState): void;
  clearSelectedRegion(): void;
  applyStreamEvent(event: StreamEvent): void;
  selectTextProvider(providerId: ProviderId): void;
  selectVisionProvider(providerId: ProviderId): void;
}

export const usePanelStore = create<PanelState>((set) => ({
  connected: false,
  draft: '',
  messages: [],
  sessionHistoryTruncated: false,
  pickStatus: 'idle',
  regionStatus: 'idle',
  pageLabel: '等待读取当前 GitHub 页面',
  providers: [],
  setConnected: (connected) => set({ connected }),
  setDraft: (draft) => set({ draft }),
  addUserMessage: (content) =>
    set((state) => ({
      draft: '',
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
        },
      ],
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
  applySessionState: ({ sessionId, messages, truncated }) =>
    set({
      sessionId,
      messages,
      sessionHistoryTruncated: truncated,
    }),
  applyPickState: (state) =>
    set(
      state.status === 'active'
        ? {
            pickStatus: 'active',
            pickStatusMessage: '请在 GitHub 页面点击要提问的元素',
            selectedElement: undefined,
            regionStatus: 'idle',
            regionStatusMessage: undefined,
            selectedRegion: undefined,
          }
        : state.status === 'selected'
          ? {
              pickStatus: 'selected',
              pickStatusMessage: undefined,
              selectedElement: state.element,
            }
          : {
              pickStatus: 'idle',
              pickStatusMessage: state.reason,
              selectedElement: undefined,
            },
    ),
  clearSelectedElement: () =>
    set({
      pickStatus: 'idle',
      pickStatusMessage: undefined,
      selectedElement: undefined,
    }),
  applyRegionState: (state) =>
    set(
      state.status === 'active'
        ? {
            regionStatus: 'active',
            regionStatusMessage: '请在 GitHub 页面拖动框选区域',
            selectedRegion: undefined,
            pickStatus: 'idle',
            pickStatusMessage: undefined,
            selectedElement: undefined,
          }
        : state.status === 'selected'
          ? {
              regionStatus: 'selected',
              regionStatusMessage: undefined,
              selectedRegion: state.region,
            }
          : {
              regionStatus: 'idle',
              regionStatusMessage: state.reason,
              selectedRegion: undefined,
            },
    ),
  clearSelectedRegion: () =>
    set({
      regionStatus: 'idle',
      regionStatusMessage: undefined,
      selectedRegion: undefined,
    }),
  applyStreamEvent: (event) =>
    set((state) => {
      if (event.kind === 'start') {
        return {
          activeRequestId: event.requestId,
          messages: [
            ...state.messages,
            {
              id: event.requestId,
              role: 'assistant',
              content: '',
              createdAt: new Date().toISOString(),
            },
          ],
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
            : [
                ...state.messages,
                {
                  id: event.requestId,
                  role: 'assistant',
                  content: event.text,
                  createdAt: new Date().toISOString(),
                },
              ],
        };
      }
      if (event.kind === 'done') {
        return { activeRequestId: undefined };
      }
      return state;
    }),
}));
