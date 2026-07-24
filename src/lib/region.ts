import type { SelectedRegion } from './types';

export function hasSufficientStructuredRegion(
  region: Pick<SelectedRegion, 'text' | 'links' | 'codeBlocks' | 'buttons'>,
): boolean {
  return (
    region.text.trim().length >= 80 ||
    region.codeBlocks.some((code) => code.trim().length >= 8) ||
    region.links.length + region.buttons.length >= 2
  );
}
