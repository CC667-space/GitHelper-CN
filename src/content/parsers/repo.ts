import type { PageContext } from '../../lib/types';
import { allTexts, createPageContext, firstText } from './common';

export function parseRepoPage(document: Document, url: string, now?: Date): PageContext {
  return createPageContext(
    document,
    url,
    'repo',
    {
      name: firstText(document, [
        '#repository-container-header strong[itemprop="name"]',
        '[data-testid="repository-container-header"] strong',
        'strong[itemprop="name"]',
      ]),
      description: firstText(document, [
        '[data-testid="repository-about"] p',
        '#repo-content-pjax-container [itemprop="about"]',
        'p.f4.my-3',
      ]),
      defaultBranch: firstText(document, [
        '[data-testid="anchor-button"] span',
        '.ref-selector-button-text',
        '[data-hotkey="w"]',
      ]),
      stats: {
        stars: firstText(document, ['a[href$="/stargazers"] strong', '#repo-stars-counter-star']),
        forks: firstText(document, ['a[href$="/forks"] strong', '#repo-network-counter']),
        watchers: firstText(document, ['a[href$="/watchers"] strong']),
      },
      languages: allTexts(document, [
        '[data-testid="repository-languages"] li',
        'ol.list-style-none span[itemprop="programmingLanguage"]',
      ]),
      readme: firstText(document, ['#readme article', '#readme'], 8_000),
    },
    now,
  );
}
