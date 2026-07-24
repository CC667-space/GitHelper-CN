import { describe, expect, it, vi } from 'vitest';

import {
  RegionController,
  extractSelectedRegion,
  hasSufficientStructuredRegion,
} from '../../src/content/selection/region';
import { selectedRegionSchema } from '../../src/lib/bridge-protocol';

function setRect(element: Element, rect: Partial<DOMRect>): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top ?? 0,
    left: rect.left ?? rect.x ?? 0,
    top: rect.top ?? rect.y ?? 0,
    right: rect.right ?? (rect.left ?? rect.x ?? 0) + (rect.width ?? 0),
    bottom: rect.bottom ?? (rect.top ?? rect.y ?? 0) + (rect.height ?? 0),
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    toJSON: () => ({}),
  });
}

function structuredFixture(): void {
  document.body.innerHTML = `
    <main>
      <article>
        <p>这是一个足够长的仓库说明，用于验证区域框选会优先提取结构化文字，而不是立即上传截图。这里继续补充一些文字，确保超过结构充分阈值。</p>
        <a href="/openai/openai-node/issues">Issues</a>
        <pre><code>pnpm install</code></pre>
        <button aria-label="复制命令">Copy</button>
      </article>
    </main>
  `;
  for (const element of document.querySelectorAll('main,article,p,a,pre,code,button')) {
    setRect(element, { left: 20, top: 20, width: 240, height: 80 });
  }
}

describe('region selection', () => {
  it('提取文字、链接、代码、按钮、outline 与坐标环境，结构充分时不需要视觉', () => {
    structuredFixture();

    const region = extractSelectedRegion(
      document,
      'https://github.com/openai/openai-node',
      { x: 10, y: 10, width: 280, height: 150 },
      window,
    );

    expect(region.text).toContain('优先提取结构化文字');
    expect(region.links[0]).toContain('https://github.com/openai/openai-node/issues');
    expect(region.codeBlocks).toContain('pnpm install');
    expect(region.buttons).toContain('复制命令');
    expect(region.htmlOutline).toContain('<pre>');
    expect(region.nearbyContext).toContain('仓库说明');
    expect(region.needsVision).toBe(false);
    expect(region.sourceUrl).toBe('https://github.com/openai/openai-node');
    expect(region.viewport.cssWidth).toBe(window.innerWidth);
    expect(region.devicePixelRatio).toBe(window.devicePixelRatio);
  });

  it('只有图像轮廓而无充分结构时标记 needsVision', () => {
    document.body.innerHTML = '<main><img alt="" src="/chart.png"></main>';
    setRect(document.querySelector('img')!, { left: 50, top: 40, width: 200, height: 120 });

    const region = extractSelectedRegion(document, 'https://github.com/example/charts', {
      x: 40,
      y: 30,
      width: 240,
      height: 160,
    });

    expect(region.text).toBe('');
    expect(region.htmlOutline).toContain('<img>');
    expect(region.needsVision).toBe(true);
    expect(hasSufficientStructuredRegion(region)).toBe(false);
    expect(() => selectedRegionSchema.parse({ ...region, needsVision: false })).toThrow(
      /needsVision/,
    );
  });

  it('drag 过程画框并返回视口坐标；Escape 可清理', async () => {
    structuredFixture();
    const controller = new RegionController(
      document,
      () => 'https://github.com/openai/openai-node',
    );
    const outcomePromise = controller.start();

    document.body.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 300,
        clientY: 180,
      }),
    );
    document.body.dispatchEvent(
      new MouseEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 10,
        clientY: 20,
      }),
    );
    const overlay = document.querySelector(
      '[data-git-helper-region-overlay="selection"]',
    ) as HTMLElement;
    expect(overlay.style.left).toBe('10px');
    expect(overlay.style.top).toBe('20px');

    document.body.dispatchEvent(
      new MouseEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 10,
        clientY: 20,
      }),
    );
    const outcome = await outcomePromise;
    expect(outcome.status).toBe('selected');
    if (outcome.status === 'selected') {
      expect(outcome.region.rect).toEqual({ x: 10, y: 20, width: 290, height: 160 });
    }
    expect(document.querySelector('[data-git-helper-region-overlay]')).toBeNull();

    const escapeOutcome = controller.start();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await expect(escapeOutcome).resolves.toMatchObject({ status: 'cancelled' });
    expect(controller.isActive()).toBe(false);
  });
});
