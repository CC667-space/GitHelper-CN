import type { SelectedRegion } from '../lib/types';

export const MAX_CAPTURE_DATA_URL_BYTES = 1_000_000;
const MAX_CAPTURE_DIMENSION = 1_600;

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

export interface DecodedScreenshot {
  width: number;
  height: number;
  crop(rect: PixelCrop): Promise<string>;
  close(): void;
}

export interface CaptureDependencies {
  captureVisibleTab(windowId: number): Promise<string>;
  decodeScreenshot(dataUrl: string): Promise<DecodedScreenshot>;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculatePixelCrop(
  region: Pick<SelectedRegion, 'rect' | 'viewport'>,
  capturedWidth: number,
  capturedHeight: number,
): PixelCrop {
  if (
    !Number.isFinite(capturedWidth) ||
    !Number.isFinite(capturedHeight) ||
    capturedWidth <= 0 ||
    capturedHeight <= 0 ||
    region.viewport.cssWidth <= 0 ||
    region.viewport.cssHeight <= 0
  ) {
    throw new Error('截图或视口尺寸无效');
  }
  const scaleX = capturedWidth / region.viewport.cssWidth;
  const scaleY = capturedHeight / region.viewport.cssHeight;
  const x = clamp(Math.round(region.rect.x * scaleX), 0, capturedWidth);
  const y = clamp(Math.round(region.rect.y * scaleY), 0, capturedHeight);
  const width = clamp(Math.round(region.rect.width * scaleX), 0, capturedWidth - x);
  const height = clamp(Math.round(region.rect.height * scaleY), 0, capturedHeight - y);
  if (width <= 0 || height <= 0) {
    throw new Error('框选区域在截图边界外或为空');
  }
  return { x, y, width, height, scaleX, scaleY };
}

function bytesFromDataUrl(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.ceil((payload.length * 3) / 4);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 32 * 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export async function decodeScreenshot(dataUrl: string): Promise<DecodedScreenshot> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  return {
    width: bitmap.width,
    height: bitmap.height,
    async crop(rect) {
      const resizeScale = Math.min(1, MAX_CAPTURE_DIMENSION / Math.max(rect.width, rect.height));
      const outputWidth = Math.max(1, Math.round(rect.width * resizeScale));
      const outputHeight = Math.max(1, Math.round(rect.height * resizeScale));
      const canvas = new OffscreenCanvas(outputWidth, outputHeight);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('无法创建截图裁剪画布');
      }
      context.drawImage(
        bitmap,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        outputWidth,
        outputHeight,
      );
      let result = await blobToDataUrl(
        await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 }),
      );
      if (bytesFromDataUrl(result) > MAX_CAPTURE_DATA_URL_BYTES) {
        result = await blobToDataUrl(
          await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.65 }),
        );
      }
      if (bytesFromDataUrl(result) > MAX_CAPTURE_DATA_URL_BYTES) {
        throw new Error('框选截图压缩后仍超过视觉请求上限');
      }
      return result;
    },
    close() {
      bitmap.close();
    },
  };
}

const defaultCaptureDependencies: CaptureDependencies = {
  captureVisibleTab: async (windowId) =>
    await chrome.tabs.captureVisibleTab(windowId, { format: 'png' }),
  decodeScreenshot,
};

export async function captureSelectedRegion(
  tab: Pick<chrome.tabs.Tab, 'windowId'>,
  region: Pick<SelectedRegion, 'rect' | 'viewport'>,
  signal: AbortSignal,
  dependencies: CaptureDependencies = defaultCaptureDependencies,
): Promise<string> {
  if (signal.aborted) {
    throw signal.reason;
  }
  if (tab.windowId === undefined) {
    throw new Error('当前标签页缺少 windowId，无法截图');
  }
  const screenshotDataUrl = await dependencies.captureVisibleTab(tab.windowId);
  if (signal.aborted) {
    throw signal.reason;
  }
  const screenshot = await dependencies.decodeScreenshot(screenshotDataUrl);
  try {
    const crop = calculatePixelCrop(region, screenshot.width, screenshot.height);
    const cropped = await screenshot.crop(crop);
    if (signal.aborted) {
      throw signal.reason;
    }
    return cropped;
  } finally {
    screenshot.close();
  }
}
