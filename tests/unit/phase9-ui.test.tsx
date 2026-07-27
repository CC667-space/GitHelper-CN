import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PanelRepositoryAnalysisState } from '../../src/lib/bridge-protocol';
import { PanelApp } from '../../src/panel/App';
import { usePanelStore } from '../../src/panel/store';

afterEach(() => {
  cleanup();
  usePanelStore.setState({
    activeRequestId: undefined,
    connected: false,
    draft: '',
    messages: [],
    pageLabel: '等待读取当前 GitHub 页面',
    providers: [],
    pickStatus: 'idle',
    pickStatusMessage: undefined,
    selectedElement: undefined,
    regionStatus: 'idle',
    regionStatusMessage: undefined,
    selectedRegion: undefined,
    searchDraft: '',
    searchTarget: 'auto',
    searchStatus: 'idle',
    searchError: undefined,
    searchResult: undefined,
    analysisStatus: 'idle',
    analysisError: undefined,
    analysisCard: undefined,
    sessionHistoryTruncated: false,
    sessionId: undefined,
    selectedTextProviderId: undefined,
    selectedVisionProviderId: undefined,
  });
});

describe('Phase 9 repository analysis Panel', () => {
  it('一键调用所选文本 Provider 并渲染固定中文分析卡', async () => {
    const analyzeRepository = vi.fn();
    const openGitHubPage = vi.fn();
    let emitAnalysis: ((state: PanelRepositoryAnalysisState) => void) | undefined;
    const connect = vi.fn(
      (
        _onEvent,
        _onProviderState,
        onConnectionChange,
        _onSessionState,
        _onPickState,
        _onRegionState,
        _onSearchState,
        onRepositoryAnalysisState,
      ) => {
        emitAnalysis = onRepositoryAnalysisState;
        onConnectionChange(true);
        return {
          send: vi.fn(),
          abort: vi.fn(),
          analyzeRepository,
          openGitHubPage,
          disconnect: vi.fn(),
        };
      },
    );
    usePanelStore.setState({ selectedTextProviderId: 'deepseek' });
    const user = userEvent.setup();
    render(<PanelApp connect={connect} />);

    await user.click(screen.getByRole('button', { name: '一键分析' }));
    expect(analyzeRepository).toHaveBeenCalledExactlyOnceWith('deepseek');
    act(() =>
      emitAnalysis?.({
        status: 'done',
        requestId: 'analysis-1',
        card: {
          repository: 'react/react',
          url: 'https://github.com/react/react',
          purpose: '用于构建 Web 和原生用户界面。',
          languages: [
            { name: 'JavaScript', percent: 90 },
            { name: 'TypeScript', percent: 10 },
          ],
          structure: {
            directories: ['packages', 'scripts', 'fixtures'],
            keyFiles: [
              {
                path: 'package.json',
                role: '依赖与构建清单',
                findings: ['脚本：build、test', '主要依赖：react、scheduler'],
              },
              {
                path: 'main.js',
                role: '程序入口',
                findings: ['定义：startApp'],
              },
            ],
            truncated: false,
          },
          platforms: ['Web/Browser', 'Node.js'],
          installation: { steps: ['npm install react'], source: 'readme' },
          release: {
            name: 'React 19.1',
            tag: 'v19.1.0',
            publishedAt: '2026-07-01T00:00:00.000Z',
            url: 'https://github.com/react/react/releases/tag/v19.1.0',
          },
          activity: {
            pushedAt: '2026-07-20T00:00:00.000Z',
            updatedAt: '2026-07-21T00:00:00.000Z',
          },
          popularity: { stars: 240_000, forks: 49_000, watchers: 6_600 },
          archived: false,
          license: { name: 'MIT License', spdxId: 'MIT' },
          issuesAndPullRequests: {
            openIssues: 1_000,
            openPullRequests: 100,
            combinedOpenCount: 1_100,
          },
          difficulty: { level: '入门', reason: '提供标准 npm 安装方式。' },
          risks: ['需核对 React 版本兼容性。'],
          nextSteps: ['阅读官方快速开始。'],
          generatedAt: '2026-07-24T00:00:00.000Z',
          sources: { dom: true, githubApi: true, provider: true },
        },
      }),
    );

    expect(screen.getByTestId('repository-analysis-card')).toBeTruthy();
    expect(screen.getByText('react/react')).toBeTruthy();
    expect(screen.getByText(/240,000/)).toBeTruthy();
    expect(screen.getByText(/1,000/)).toBeTruthy();
    expect(screen.getByText('npm install react')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '项目文件洞察' })).toBeTruthy();
    expect(screen.getByText('package.json')).toBeTruthy();
    expect(screen.getByText(/脚本：build、test/)).toBeTruthy();
    expect(screen.getByText(/packages · scripts · fixtures/)).toBeTruthy();
    expect(screen.getByText(/上手难度：入门/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '收起分析' }));
    expect(screen.queryByTestId('repository-analysis-card')).toBeNull();
    await user.click(screen.getByRole('button', { name: '展开分析' }));
    expect(screen.getByTestId('repository-analysis-card')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '打开仓库' }));
    expect(openGitHubPage).toHaveBeenCalledWith('https://github.com/react/react');
  });

  it('缺字段与降级原因可读显示', () => {
    let emitAnalysis: ((state: PanelRepositoryAnalysisState) => void) | undefined;
    const connect = vi.fn(
      (
        _onEvent,
        _onProviderState,
        onConnectionChange,
        _onSessionState,
        _onPickState,
        _onRegionState,
        _onSearchState,
        onRepositoryAnalysisState,
      ) => {
        emitAnalysis = onRepositoryAnalysisState;
        onConnectionChange(true);
        return {
          send: vi.fn(),
          abort: vi.fn(),
          disconnect: vi.fn(),
        };
      },
    );
    render(<PanelApp connect={connect} />);
    act(() =>
      emitAnalysis?.({
        status: 'done',
        requestId: 'analysis-2',
        card: {
          repository: 'octocat/Hello-World',
          url: 'https://github.com/octocat/Hello-World',
          purpose: '公开信息不足。',
          languages: [],
          structure: { directories: [], keyFiles: [], truncated: false },
          platforms: [],
          installation: { steps: [], source: 'unknown' },
          release: null,
          activity: {},
          popularity: {},
          archived: null,
          license: null,
          issuesAndPullRequests: {},
          difficulty: { level: '未知', reason: '资料不足。' },
          risks: [],
          nextSteps: ['阅读 README。'],
          generatedAt: '2026-07-24T00:00:00.000Z',
          sources: { dom: true, githubApi: false, provider: false },
          degradedNotice: 'GitHub core 匿名配额暂不可用；本次使用 DOM 降级。',
        },
      }),
    );

    expect(screen.getByText('未获取语言数据')).toBeTruthy();
    expect(screen.getByText('未获取关键文件内容')).toBeTruthy();
    expect(screen.getByText('未找到正式 Release')).toBeTruthy();
    expect(screen.getByText(/core 匿名配额暂不可用/)).toBeTruthy();
  });
});
