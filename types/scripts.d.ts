declare module '*scan-build-safety.mjs' {
  export function findUnsafePatterns(relativePath: string, content: string): string[];
  export function scanBuildDirectory(directory?: string): Promise<string[]>;
}
