import { describe, expect, it } from 'vitest';

import {
  SEARCH_CONVERSION_SYSTEM_PROMPT,
  convertNaturalLanguageSearch,
} from '../../src/background/search-query';

const NOW = new Date('2026-07-24T08:00:00.000Z');

describe('中文自然语言 GitHub 搜索转换', () => {
  it.each([
    {
      input: '找最近一年更新、Star 超过 1000 的 Python 机器学习仓库',
      target: 'auto' as const,
      expectedTarget: 'repositories',
      qualifiers: ['language:Python', 'stars:>1000', 'pushed:>=2025-07-24'],
    },
    {
      input: '寻找 topic React、至少 5000 星标且未归档的仓库',
      target: 'auto' as const,
      expectedTarget: 'repositories',
      qualifiers: ['topic:react', 'stars:>=5000', 'archived:false'],
    },
    {
      input: '搜索 facebook/react 里仍未关闭的 bug issue',
      target: 'auto' as const,
      expectedTarget: 'issues',
      qualifiers: ['repo:facebook/react', 'is:issue', 'is:open', 'label:bug'],
    },
    {
      input: '找带 good first issue 标签的开放 TypeScript issue',
      target: 'auto' as const,
      expectedTarget: 'issues',
      qualifiers: ['is:issue', 'is:open', 'label:"good first issue"', 'language:TypeScript'],
    },
    {
      input: '本月更新的 Rust CLI 工具',
      target: 'repositories' as const,
      expectedTarget: 'repositories',
      qualifiers: ['language:Rust', 'topic:cli', 'pushed:>=2026-07-01'],
    },
  ])('$input', ({ input, target, expectedTarget, qualifiers }) => {
    const result = convertNaturalLanguageSearch(input, target, NOW);
    expect(result.target).toBe(expectedTarget);
    for (const qualifier of qualifiers) {
      expect(result.query).toContain(qualifier);
    }
    expect(result.explanation).toMatch(/搜索公开/);
  });

  it('保留用户已经写出的 GitHub 限定词且不重复添加', () => {
    const result = convertNaturalLanguageSearch(
      '找解析器 language:Go stars:>=200 archived:false',
      'repositories',
      NOW,
    );
    expect(result.query.match(/language:Go/gu)).toHaveLength(1);
    expect(result.query.match(/stars:>=200/gu)).toHaveLength(1);
    expect(result.query).toContain('archived:false');
  });

  it('拒绝空输入，并冻结只读转换 Prompt 边界', () => {
    expect(() => convertNaturalLanguageSearch('   ')).toThrow(/不能为空/);
    expect(SEARCH_CONVERSION_SYSTEM_PROMPT).toContain('只读');
    expect(SEARCH_CONVERSION_SYSTEM_PROMPT).toContain('不得生成写操作');
  });
});
