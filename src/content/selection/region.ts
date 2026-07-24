import type { RegionOutcome } from '../../lib/bridge-protocol';
import { hasSufficientStructuredRegion } from '../../lib/region';
import type { SelectedRegion } from '../../lib/types';

export { hasSufficientStructuredRegion } from '../../lib/region';

const REGION_OVERLAY_ATTRIBUTE = 'data-git-helper-region-overlay';
const MIN_REGION_SIZE = 8;
const MAX_SCAN_ELEMENTS = 2_000;

interface Point {
  x: number;
  y: number;
}

interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function normalizedText(value: string | null | undefined, maxLength: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function intersects(rect: DOMRect, selection: ViewportRect): boolean {
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  return (
    rect.left < selection.x + selection.width &&
    rect.right > selection.x &&
    rect.top < selection.y + selection.height &&
    rect.bottom > selection.y
  );
}

function elementsWithin(document: Document, selector: string, selection: ViewportRect): Element[] {
  return [...document.querySelectorAll(selector)]
    .slice(0, MAX_SCAN_ELEMENTS)
    .filter(
      (element) =>
        !element.closest(`[${REGION_OVERLAY_ATTRIBUTE}]`) &&
        intersects(element.getBoundingClientRect(), selection),
    );
}

function uniqueBounded(values: string[], maxItems: number, maxItemLength: number): string[] {
  return [
    ...new Set(
      values
        .map((value) => normalizedText(value, maxItemLength))
        .filter((value) => value.length > 0),
    ),
  ].slice(0, maxItems);
}

function resolvedHref(element: Element, pageUrl: string): string | undefined {
  const href = element.getAttribute('href');
  if (!href) {
    return undefined;
  }
  try {
    return new URL(href, pageUrl).href;
  } catch {
    return href;
  }
}

function outlineEntry(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id.slice(0, 100)}` : '';
  const role = element.getAttribute('role');
  const type = element.getAttribute('type');
  return `<${tag}${id}${role ? `[role=${role.slice(0, 100)}]` : ''}${type ? `[type=${type.slice(0, 50)}]` : ''}>`;
}

export function extractSelectedRegion(
  document: Document,
  pageUrl: string,
  rect: ViewportRect,
  view: Window = window,
): SelectedRegion {
  const textElements = elementsWithin(
    document,
    'h1,h2,h3,h4,h5,h6,p,li,td,th,label,blockquote,figcaption,[role="heading"]',
    rect,
  );
  const links = elementsWithin(document, 'a[href]', rect);
  const codeElements = elementsWithin(document, 'pre,code', rect).filter(
    (element) => element.tagName.toLowerCase() === 'pre' || !element.closest('pre'),
  );
  const buttonElements = elementsWithin(
    document,
    'button,input[type="button"],input[type="submit"],[role="button"]',
    rect,
  );
  const outlineElements = elementsWithin(
    document,
    'h1,h2,h3,h4,h5,h6,p,a,button,input,textarea,select,pre,code,img,table,ul,ol,li',
    rect,
  );
  const text = normalizedText(
    uniqueBounded(
      textElements.map((element) => element.textContent ?? ''),
      80,
      1_000,
    ).join('\n'),
    8_000,
  );
  const extractedLinks = uniqueBounded(
    links.map((element) => {
      const href = resolvedHref(element, pageUrl);
      const label = normalizedText(element.textContent ?? element.getAttribute('aria-label'), 300);
      return href ? `${label || href} → ${href}` : label;
    }),
    12,
    800,
  );
  const codeBlocks = uniqueBounded(
    codeElements.map((element) => element.textContent ?? ''),
    6,
    1_500,
  );
  const buttons = uniqueBounded(
    buttonElements.map((element) => {
      const value = element instanceof HTMLInputElement ? String(element.value ?? '') : '';
      return element.getAttribute('aria-label') || value || element.textContent || '';
    }),
    12,
    500,
  );
  const htmlOutline = normalizedText(
    uniqueBounded(outlineElements.map(outlineEntry), 120, 200).join(' '),
    4_000,
  );
  const nearbyContainers = elementsWithin(
    document,
    'article,[role="article"],section,main,[role="main"],li',
    {
      x: Math.max(0, rect.x - 80),
      y: Math.max(0, rect.y - 80),
      width: rect.width + 160,
      height: rect.height + 160,
    },
  );
  const nearbyContext = normalizedText(nearbyContainers[0]?.textContent, 4_000);
  const partial: Omit<
    SelectedRegion,
    'needsVision' | 'sourceUrl' | 'rect' | 'viewport' | 'scroll' | 'devicePixelRatio' | 'zoomFactor'
  > = {
    text,
    links: extractedLinks,
    codeBlocks,
    buttons,
    htmlOutline,
    nearbyContext,
  };
  return {
    ...partial,
    needsVision: !hasSufficientStructuredRegion(partial),
    sourceUrl: pageUrl,
    rect,
    viewport: {
      cssWidth: view.innerWidth,
      cssHeight: view.innerHeight,
    },
    scroll: {
      x: Math.max(0, view.scrollX),
      y: Math.max(0, view.scrollY),
    },
    devicePixelRatio: view.devicePixelRatio,
    zoomFactor: view.visualViewport?.scale ?? 1,
  };
}

function selectionRect(start: Point, end: Point, view: Window): ViewportRect {
  const left = Math.max(0, Math.min(start.x, end.x));
  const top = Math.max(0, Math.min(start.y, end.y));
  const right = Math.min(view.innerWidth, Math.max(start.x, end.x));
  const bottom = Math.min(view.innerHeight, Math.max(start.y, end.y));
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export class RegionController {
  private active = false;
  private dragging = false;
  private startPoint?: Point;
  private selection?: HTMLDivElement;
  private instruction?: HTMLDivElement;
  private resolve?: (outcome: RegionOutcome) => void;

  constructor(
    private readonly document: Document,
    private readonly pageUrl: () => string,
  ) {}

  isActive(): boolean {
    return this.active;
  }

  start(): Promise<RegionOutcome> {
    if (this.active) {
      this.cancel('已重新进入框选');
    }
    this.active = true;
    this.mount();
    this.document.addEventListener('pointerdown', this.handlePointerDown, true);
    this.document.addEventListener('pointermove', this.handlePointerMove, true);
    this.document.addEventListener('pointerup', this.handlePointerUp, true);
    this.document.addEventListener('keydown', this.handleKeyDown, true);
    return new Promise<RegionOutcome>((resolve) => {
      this.resolve = resolve;
    });
  }

  cancel(reason = '已取消框选'): boolean {
    if (!this.active) {
      return false;
    }
    this.finish({ status: 'cancelled', reason });
    return true;
  }

  private readonly handlePointerDown = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (
      pointer.button !== 0 ||
      (event.target as Element | null)?.closest?.(`[${REGION_OVERLAY_ATTRIBUTE}]`)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.dragging = true;
    this.startPoint = { x: pointer.clientX, y: pointer.clientY };
    this.updateSelection(this.startPoint, this.startPoint);
  };

  private readonly handlePointerMove = (event: Event): void => {
    if (!this.dragging || !this.startPoint) {
      return;
    }
    const pointer = event as PointerEvent;
    event.preventDefault();
    event.stopPropagation();
    this.updateSelection(this.startPoint, { x: pointer.clientX, y: pointer.clientY });
  };

  private readonly handlePointerUp = (event: Event): void => {
    if (!this.dragging || !this.startPoint) {
      return;
    }
    const pointer = event as PointerEvent;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const view = this.document.defaultView ?? window;
    const rect = selectionRect(this.startPoint, { x: pointer.clientX, y: pointer.clientY }, view);
    if (rect.width < MIN_REGION_SIZE || rect.height < MIN_REGION_SIZE) {
      this.finish({ status: 'cancelled', reason: '框选区域过小' });
      return;
    }
    this.finish({
      status: 'selected',
      region: extractSelectedRegion(this.document, this.pageUrl(), rect, view),
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

  private mount(): void {
    const selection = this.document.createElement('div');
    selection.setAttribute(REGION_OVERLAY_ATTRIBUTE, 'selection');
    selection.setAttribute('aria-hidden', 'true');
    Object.assign(selection.style, {
      position: 'fixed',
      display: 'none',
      pointerEvents: 'none',
      border: '2px solid #7c3aed',
      background: 'rgba(124, 58, 237, 0.12)',
      zIndex: '2147483646',
    });
    const instruction = this.document.createElement('div');
    instruction.setAttribute(REGION_OVERLAY_ATTRIBUTE, 'instruction');
    instruction.setAttribute('role', 'status');
    instruction.textContent = 'GitHelper-CN：拖动框选区域，按 Esc 取消';
    Object.assign(instruction.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 12px',
      color: '#ffffff',
      background: '#3b0764',
      borderRadius: '6px',
      font: '13px/1.4 system-ui, sans-serif',
      pointerEvents: 'none',
      zIndex: '2147483647',
    });
    this.document.documentElement.append(selection, instruction);
    this.selection = selection;
    this.instruction = instruction;
  }

  private updateSelection(start: Point, end: Point): void {
    if (!this.selection) {
      return;
    }
    const rect = selectionRect(start, end, this.document.defaultView ?? window);
    Object.assign(this.selection.style, {
      display: 'block',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  private finish(outcome: RegionOutcome): void {
    const resolve = this.resolve;
    this.resolve = undefined;
    this.active = false;
    this.dragging = false;
    this.startPoint = undefined;
    this.document.removeEventListener('pointerdown', this.handlePointerDown, true);
    this.document.removeEventListener('pointermove', this.handlePointerMove, true);
    this.document.removeEventListener('pointerup', this.handlePointerUp, true);
    this.document.removeEventListener('keydown', this.handleKeyDown, true);
    this.selection?.remove();
    this.instruction?.remove();
    this.selection = undefined;
    this.instruction = undefined;
    resolve?.(outcome);
  }
}
