import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OptionsApp } from '../../src/options/App';
import { PanelApp } from '../../src/panel/App';

describe('Phase 2 UI skeleton', () => {
  it('Panel 包含 Provider、会话和输入区', () => {
    const html = renderToStaticMarkup(<PanelApp />);
    expect(html).toContain('当前 Provider');
    expect(html).toContain('data-testid="conversation"');
    expect(html).toContain('问问当前 GitHub 页面');
  });

  it('Options 包含数据流向披露占位', () => {
    const html = renderToStaticMarkup(<OptionsApp />);
    expect(html).toContain('数据流向披露');
    expect(html).toContain('私有仓库');
    expect(html).toContain('禁止出站');
  });
});
