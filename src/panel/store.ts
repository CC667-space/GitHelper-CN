import { create } from 'zustand';

import type {
  PanelSessionState,
  PanelPickState,
  PanelRegionState,
  PanelSearchState,
  PanelRepositoryAnalysisState,
  ProviderRuntimeView,
  ProviderState,
  StreamEvent,
} from '../lib/bridge-protocol';
import type { ProviderId } from '../lib/types';
import { providerCatalogEntry } from '../lib/provider-catalog';
import type { SelectedElement, SelectedRegion } from '../lib/types';
import type { GitHubSearchResult, SearchTarget } from '../lib/github-search';
import type { RepositoryAnalysisCard } from '../lib/repository-analysis';

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
  recentSessions: NonNullable<PanelSessionState['recentSessions']>;
  sessionHistoryTruncated: boolean;
  sessionId?: string;
  startNewSession: boolean;
  pickStatus: 'idle' | 'active' | 'selected';
  pickStatusMessage?: string;
  selectedElement?: SelectedElement;
  regionStatus: 'idle' | 'active' | 'selected';
  regionStatusMessage?: string;
  selectedRegion?: SelectedRegion;
  searchDraft: string;
  searchTarget: SearchTarget;
  searchStatus: 'idle' | 'searching' | 'done' | 'error';
  searchError?: string;
  searchResult?: GitHubSearchResult;
  analysisStatus: 'idle' | 'analyzing' | 'done' | 'error';
  analysisError?: string;
  analysisCard?: RepositoryAnalysisCard;
  pageLabel: string;
  providers: ProviderRuntimeView[];
  selectedTextProviderId?: ProviderId;
  selectedVisionProviderId?: ProviderId;
  setConnected(connected: boolean): void;
  setDraft(draft: string): void;
  addUserMessage(content: string): void;
  applyProviderState(state: ProviderState): void;
  applySessionState(state: PanelSessionState): void;
  beginNewSession(): void;
  applyPickState(state: PanelPickState): void;
  clearSelectedElement(): void;
  applyRegionState(state: PanelRegionState): void;
  clearSelectedRegion(): void;
  setSearchDraft(value: string): void;
  setSearchTarget(value: SearchTarget): void;
  applySearchState(state: PanelSearchState): void;
  applyRepositoryAnalysisState(state: PanelRepositoryAnalysisState): void;
  applyStreamEvent(event: StreamEvent): void;
  selectTextProvider(providerId: ProviderId): void;
  selectVisionProvider(providerId: ProviderId): void;
}

export const usePanelStore = create<PanelState>((set) => ({
  connected: false,
  draft: '',
  messages: [],
  recentSessions: [],
  sessionHistoryTruncated: false,
  startNewSession: false,
  pickStatus: 'idle',
  regionStatus: 'idle',
  searchDraft: '',
  searchTarget: 'auto',
  searchStatus: 'idle',
  analysisStatus: 'idle',
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
    set((state) => {
      const commonProviders = providers.filter(
        (provider) => providerCatalogEntry(provider.id).visibility === 'common',
      );
      const selectedTextStillCommon = commonProviders.some(
        (provider) => provider.id === state.selectedTextProviderId,
      );
      const selectedVisionStillCommon = commonProviders.some(
        (provider) => provider.id === state.selectedVisionProviderId,
      );
      return {
        providers,
        selectedTextProviderId: selectedTextStillCommon
          ? state.selectedTextProviderId
          : commonProviders.find((provider) => provider.id === 'deepseek')?.id,
        selectedVisionProviderId: selectedVisionStillCommon
          ? state.selectedVisionProviderId
          : (commonProviders.find(
              (provider) =>
                provider.availability === 'available' && provider.capabilities.supportsVision,
            )?.id ?? commonProviders.find((provider) => provider.id === 'openrouter')?.id),
      };
    }),
  selectTextProvider: (selectedTextProviderId) => set({ selectedTextProviderId }),
  selectVisionProvider: (selectedVisionProviderId) => set({ selectedVisionProviderId }),
  applySessionState: ({ sessionId, messages, truncated, cause, recentSessions }) =>
    set((state) => {
      const nextRecentSessions = recentSessions ?? state.recentSessions;
      if (
        (cause === undefined || cause === 'hydrate') &&
        (state.startNewSession || (state.sessionId !== undefined && sessionId !== state.sessionId))
      ) {
        return { recentSessions: nextRecentSessions };
      }
      return {
        sessionId,
        messages,
        recentSessions: nextRecentSessions,
        sessionHistoryTruncated: truncated,
        startNewSession: cause === 'new',
      };
    }),
  beginNewSession: () =>
    set({
      messages: [],
      sessionHistoryTruncated: false,
      sessionId: undefined,
      startNewSession: true,
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
  setSearchDraft: (searchDraft) => set({ searchDraft }),
  setSearchTarget: (searchTarget) => set({ searchTarget }),
  applySearchState: (state) =>
    set(
      state.status === 'searching'
        ? {
            searchStatus: 'searching',
            searchError: undefined,
            searchResult: undefined,
          }
        : state.status === 'done'
          ? {
              searchStatus: 'done',
              searchError: undefined,
              searchResult: state.result,
            }
          : {
              searchStatus: 'error',
              searchError: state.error,
              searchResult: undefined,
            },
    ),
  applyRepositoryAnalysisState: (state) =>
    set(
      state.status === 'analyzing'
        ? {
            analysisStatus: 'analyzing',
            analysisError: undefined,
            analysisCard: undefined,
          }
        : state.status === 'done'
          ? {
              analysisStatus: 'done',
              analysisError: undefined,
              analysisCard: state.card,
            }
          : {
              analysisStatus: 'error',
              analysisError: state.error,
              analysisCard: undefined,
            },
    ),
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
