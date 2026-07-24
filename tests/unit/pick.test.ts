import { describe, expect, it, vi } from 'vitest';

import { PickController, extractSelectedElement } from '../../src/content/selection/pick';

function fixture(): { article: HTMLElement; anchor: HTMLAnchorElement; label: HTMLSpanElement } {
  document.body.innerHTML = `
    <main>
      <article>
        <p>仓库说明：这是一个 JavaScript SDK。</p>
        <a id="issues-link" aria-label="查看 Issues" href="/openai/openai-node/issues">
          <span>Issues 42</span>
        </a>
      </article>
    </main>
  `;
  return {
    article: document.querySelector('article')!,
    anchor: document.querySelector('a')!,
    label: document.querySelector('span')!,
  };
}

describe('click selection', () => {
  it('从嵌套点击目标提取稳定的 SelectedElement', () => {
    const { anchor } = fixture();

    const selected = extractSelectedElement(
      anchor,
      document,
      'https://github.com/openai/openai-node',
    );

    expect(selected).toEqual({
      tag: 'a',
      role: 'link',
      text: '查看 Issues',
      href: 'https://github.com/openai/openai-node/issues',
      sourceUrl: 'https://github.com/openai/openai-node',
      attrs: {
        id: 'issues-link',
        'aria-label': '查看 Issues',
      },
      nearbyContext: '仓库说明：这是一个 JavaScript SDK。 Issues 42',
      pageType: 'repo',
    });
  });

  it('password input 不提取输入值', () => {
    document.body.innerHTML =
      '<main><input type="password" aria-label="密码" value="do-not-store-this-secret"></main>';
    const input = document.querySelector('input')!;

    const selected = extractSelectedElement(
      input,
      document,
      'https://github.com/settings/security',
    );

    expect(selected.text).toBe('密码');
    expect(JSON.stringify(selected)).not.toContain('do-not-store-this-secret');
  });

  it('进入 pick 后悬停显示叠层，点击被拦截并返回逻辑元素', async () => {
    const { anchor, label } = fixture();
    const ordinaryClick = vi.fn();
    anchor.addEventListener('click', ordinaryClick);
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 130,
      bottom: 50,
      width: 120,
      height: 30,
      toJSON: () => ({}),
    });
    const picker = new PickController(document, () => 'https://github.com/openai/openai-node');

    const outcomePromise = picker.start();
    label.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    const overlay = document.querySelector(
      '[data-git-helper-selection-overlay="highlight"]',
    ) as HTMLElement;
    expect(overlay.style.left).toBe('10px');
    expect(overlay.style.width).toBe('120px');

    const clickDispatched = label.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    const outcome = await outcomePromise;

    expect(clickDispatched).toBe(false);
    expect(ordinaryClick).not.toHaveBeenCalled();
    expect(outcome.status).toBe('selected');
    if (outcome.status === 'selected') {
      expect(outcome.element.tag).toBe('a');
      expect(outcome.element.href).toContain('/issues');
    }
    expect(picker.isActive()).toBe(false);
    expect(document.querySelector('[data-git-helper-selection-overlay]')).toBeNull();
  });

  it('Escape 和外部清理都能退出 pick 且移除叠层', async () => {
    fixture();
    const picker = new PickController(document, () => 'https://github.com/openai/openai-node');
    const escapeOutcome = picker.start();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await expect(escapeOutcome).resolves.toMatchObject({
      status: 'cancelled',
      reason: expect.stringContaining('Escape'),
    });

    const navigationOutcome = picker.start();
    expect(picker.cancel('页面已变化')).toBe(true);
    await expect(navigationOutcome).resolves.toEqual({
      status: 'cancelled',
      reason: '页面已变化',
    });
    expect(picker.cancel()).toBe(false);
    expect(document.querySelector('[data-git-helper-selection-overlay]')).toBeNull();
  });
});
