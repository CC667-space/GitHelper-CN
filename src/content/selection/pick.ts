import type { PickOutcome } from '../../lib/bridge-protocol';
import type { PageType, SelectedElement } from '../../lib/types';
import { detectPageType } from '../detector';

const OVERLAY_ATTRIBUTE = 'data-git-helper-selection-overlay';
const MAX_SELECTED_TEXT = 8_000;
const MAX_NEARBY_CONTEXT = 8_000;

const SAFE_ATTRIBUTES = [
  'id',
  'name',
  'type',
  'title',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'data-testid',
  'data-view-component',
  'itemprop',
] as const;

function normalizedText(value: string | null | undefined, maxLength: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function derivedRole(element: Element): string | undefined {
  const explicit = element.getAttribute('role');
  if (explicit) {
    return explicit.slice(0, 100);
  }
  switch (element.tagName.toLowerCase()) {
    case 'a':
      return element.hasAttribute('href') ? 'link' : undefined;
    case 'button':
      return 'button';
    case 'textarea':
      return 'textbox';
    case 'select':
      return 'combobox';
    case 'input': {
      const type = element.getAttribute('type')?.toLowerCase();
      return type === 'checkbox' || type === 'radio' ? type : 'textbox';
    }
    default:
      return undefined;
  }
}

function logicalTarget(target: EventTarget | null): Element | undefined {
  if (!(target instanceof Element) || target.closest(`[${OVERLAY_ATTRIBUTE}]`)) {
    return undefined;
  }
  return (
    target.closest(
      'a[href], button, input, textarea, select, summary, [role="button"], [role="link"]',
    ) ?? target
  );
}

function stableAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const name of SAFE_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value) {
      attrs[name] = value.slice(0, 1_000);
    }
  }
  return attrs;
}

function nearbyContext(element: Element): string {
  const container =
    element.closest('article, [role="article"], li, section, main, [role="main"]') ??
    element.parentElement;
  return normalizedText(container?.textContent, MAX_NEARBY_CONTEXT);
}

function resolvedHref(element: Element, pageUrl: string): string | undefined {
  if (element.tagName.toLowerCase() !== 'a') {
    return undefined;
  }
  const raw = element.getAttribute('href');
  if (!raw) {
    return undefined;
  }
  try {
    return new URL(raw, pageUrl).href.slice(0, 4_000);
  } catch {
    return raw.slice(0, 4_000);
  }
}

export function extractSelectedElement(
  element: Element,
  document: Document,
  pageUrl: string,
  pageType: PageType = detectPageType(pageUrl, document),
): SelectedElement {
  const inputValue =
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    element.getAttribute('type')?.toLowerCase() !== 'password'
      ? element.value
      : undefined;
  const accessibleText =
    element.getAttribute('aria-label') ??
    inputValue ??
    (element as HTMLElement).innerText ??
    element.textContent;
  return {
    tag: element.tagName.toLowerCase(),
    role: derivedRole(element),
    text: normalizedText(accessibleText, MAX_SELECTED_TEXT),
    href: resolvedHref(element, pageUrl),
    sourceUrl: pageUrl,
    attrs: stableAttributes(element),
    nearbyContext: nearbyContext(element),
    pageType,
  };
}

export class PickController {
  private active = false;
  private hovered?: Element;
  private overlay?: HTMLDivElement;
  private instruction?: HTMLDivElement;
  private resolve?: (outcome: PickOutcome) => void;

  constructor(
    private readonly document: Document,
    private readonly pageUrl: () => string,
  ) {}

  isActive(): boolean {
    return this.active;
  }

  start(): Promise<PickOutcome> {
    if (this.active) {
      this.cancel('已重新进入点击选择');
    }
    this.active = true;
    this.mountOverlay();
    this.document.addEventListener('pointermove', this.handlePointerMove, true);
    this.document.addEventListener('click', this.handleClick, true);
    this.document.addEventListener('keydown', this.handleKeyDown, true);
    return new Promise<PickOutcome>((resolve) => {
      this.resolve = resolve;
    });
  }

  cancel(reason = '已取消点击选择'): boolean {
    if (!this.active) {
      return false;
    }
    this.finish({ status: 'cancelled', reason });
    return true;
  }

  private readonly handlePointerMove = (event: Event): void => {
    const target = logicalTarget(event.target);
    if (!target || target === this.hovered) {
      return;
    }
    this.hovered = target;
    this.positionOverlay(target);
  };

  private readonly handleClick = (event: MouseEvent): void => {
    const target = logicalTarget(event.target);
    if (!target) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const pageUrl = this.pageUrl();
    this.finish({
      status: 'selected',
      element: extractSelectedElement(target, this.document, pageUrl),
    });
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.cancel('已按 Escape 取消');
  };

  private mountOverlay(): void {
    const overlay = this.document.createElement('div');
    overlay.setAttribute(OVERLAY_ATTRIBUTE, 'highlight');
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'fixed',
      display: 'none',
      pointerEvents: 'none',
      border: '2px solid #2563eb',
      borderRadius: '4px',
      background: 'rgba(37, 99, 235, 0.10)',
      boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.85)',
      zIndex: '2147483646',
    });
    const instruction = this.document.createElement('div');
    instruction.setAttribute(OVERLAY_ATTRIBUTE, 'instruction');
    instruction.setAttribute('role', 'status');
    instruction.textContent = 'GitHelper-CN：点击要提问的元素，按 Esc 取消';
    Object.assign(instruction.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 12px',
      color: '#ffffff',
      background: '#0f172a',
      borderRadius: '6px',
      font: '13px/1.4 system-ui, sans-serif',
      pointerEvents: 'none',
      zIndex: '2147483647',
    });
    this.document.documentElement.append(overlay, instruction);
    this.overlay = overlay;
    this.instruction = instruction;
  }

  private positionOverlay(element: Element): void {
    if (!this.overlay) {
      return;
    }
    const rect = element.getBoundingClientRect();
    Object.assign(this.overlay.style, {
      display: rect.width > 0 && rect.height > 0 ? 'block' : 'none',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  private finish(outcome: PickOutcome): void {
    const resolve = this.resolve;
    this.resolve = undefined;
    this.active = false;
    this.hovered = undefined;
    this.document.removeEventListener('pointermove', this.handlePointerMove, true);
    this.document.removeEventListener('click', this.handleClick, true);
    this.document.removeEventListener('keydown', this.handleKeyDown, true);
    this.overlay?.remove();
    this.instruction?.remove();
    this.overlay = undefined;
    this.instruction = undefined;
    resolve?.(outcome);
  }
}
