import { describe, expect, it, vi } from 'vitest';

import {
  calculatePixelCrop,
  captureSelectedRegion,
  type CaptureDependencies,
} from '../../src/background/capture';
import type { SelectedRegion } from '../../src/lib/types';

function region(overrides: Partial<SelectedRegion> = {}): SelectedRegion {
  return {
    text: '',
    links: [],
    codeBlocks: [],
    buttons: [],
    htmlOutline: '<img>',
    nearbyContext: '',
    needsVision: true,
    sourceUrl: 'https://github.com/example/charts',
    rect: { x: 100, y: 50, width: 200, height: 100 },
    viewport: { cssWidth: 832, cssHeight: 718 },
    scroll: { x: 0, y: 914 },
    devicePixelRatio: 1.5,
    zoomFactor: 1.25,
    ...overrides,
  };
}

describe('trusted region capture', () => {
  it('复用 Phase 0 比例法换算像素且不扣 scroll', () => {
    const crop = calculatePixelCrop(region(), 1_560, 1_347);

    expect(crop).toEqual({
      x: Math.round(100 * (1_560 / 832)),
      y: Math.round(50 * (1_347 / 718)),
      width: Math.round(200 * (1_560 / 832)),
      height: Math.round(100 * (1_347 / 718)),
      scaleX: 1_560 / 832,
      scaleY: 1_347 / 718,
    });
  });

  it('截图只在内存传入裁剪器，完成后关闭 bitmap 替身', async () => {
    const crop = vi.fn(async () => 'data:image/jpeg;base64,CROPPED');
    const close = vi.fn();
    const dependencies: CaptureDependencies = {
      captureVisibleTab: vi.fn(async () => 'data:image/png;base64,FULL'),
      decodeScreenshot: vi.fn(async () => ({
        width: 1_560,
        height: 1_347,
        crop,
        close,
      })),
    };

    const result = await captureSelectedRegion(
      { windowId: 9 },
      region(),
      new AbortController().signal,
      dependencies,
    );

    expect(result).toBe('data:image/jpeg;base64,CROPPED');
    expect(dependencies.captureVisibleTab).toHaveBeenCalledExactlyOnceWith(9);
    expect(crop).toHaveBeenCalledWith(
      expect.objectContaining({
        x: Math.round(100 * (1_560 / 832)),
        y: Math.round(50 * (1_347 / 718)),
      }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('空/越界区域与已取消请求不截图', async () => {
    expect(() =>
      calculatePixelCrop(region({ rect: { x: 900, y: 800, width: 20, height: 20 } }), 1_560, 1_347),
    ).toThrow(/边界外或为空/);

    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    const dependencies: CaptureDependencies = {
      captureVisibleTab: vi.fn(),
      decodeScreenshot: vi.fn(),
    };
    await expect(
      captureSelectedRegion({ windowId: 9 }, region(), controller.signal, dependencies),
    ).rejects.toBeInstanceOf(DOMException);
    expect(dependencies.captureVisibleTab).not.toHaveBeenCalled();
  });
});
