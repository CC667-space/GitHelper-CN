export type PageType = 'repo' | 'issue' | 'pr' | 'releases' | 'blob' | 'search' | 'code' | 'other';

export interface PageContext {
  url: string;
  pageType: PageType;
  repository?: string;
  isPrivate: boolean;
  issueOrPrNumber?: number;
  extracted: Record<string, unknown>;
  pageSummary?: string;
  capturedAt: string;
}

export interface SelectedElement {
  tag: string;
  role?: string;
  text: string;
  href?: string;
  sourceUrl?: string;
  attrs: Record<string, string>;
  nearbyContext: string;
  pageType: PageType;
}

export interface SelectedRegion {
  text: string;
  links: string[];
  codeBlocks: string[];
  buttons: string[];
  htmlOutline: string;
  nearbyContext: string;
  needsVision: boolean;
  rect: { x: number; y: number; width: number; height: number };
  viewport: { cssWidth: number; cssHeight: number };
  scroll: { x: number; y: number };
  devicePixelRatio: number;
  zoomFactor?: number;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  createdAt: string;
}

export interface Session {
  schemaVersion: number;
  sessionId: string;
  pageUrl: string;
  pageType: string;
  repository?: string;
  messages: Message[];
  pageSummary?: string;
  historySummary?: string;
  updatedAt: string;
  createdAt: string;
}

export interface OperationPolicy {
  navigation: 'auto' | 'confirm';
  search: 'auto' | 'confirm';
  downloads: 'confirm' | 'deny';
  accountChanges: 'deny';
}

export interface UserPreferences {
  schemaVersion: number;
  language: 'zh-CN';
  technicalLevel: 'beginner' | 'intermediate' | 'advanced';
  operatingSystem: string;
  explanationPreference: string;
  operationPolicy: OperationPolicy;
  visionEnabled: boolean;
}

export type ProviderId = 'deepseek' | 'uuapi' | 'openrouter';

export interface ProviderCredential {
  providerId: ProviderId;
  apiKey: string;
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsToolCalls: boolean;
  supportsStructuredOutput: boolean;
  supportsUsage: boolean;
  supportsAbort: boolean;
  imageInputFormat: 'openai_image_url' | 'none';
  toolCallStreamingFormat: 'openai_delta' | 'none';
  errorResponseFormat: 'openai' | 'custom';
  probedAt?: string;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  apiHost: string;
  textModel: string;
  visionModel?: string;
  capabilities: ProviderCapabilities;
  keyMasked?: string;
}

export interface ProviderRouting {
  textProviderId: ProviderId;
  visionProviderId: ProviderId;
  fallbackProviderId: ProviderId;
  manualOverrideId?: ProviderId;
}

export interface AIRequest {
  providerId: ProviderId;
  model: string;
  messages: Message[];
  needsVision: boolean;
  images?: string[];
  timeoutMs: number;
  maxPayloadBytes: number;
}

export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  providerId: ProviderId;
  model: string;
}

export interface OperationConfirmation {
  action: string;
  description: string;
  impact: string;
  recommended: 'allow' | 'deny';
  category: 'download' | 'external';
}
