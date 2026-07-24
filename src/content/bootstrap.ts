export function initializeOnce(
  registry: Record<string, unknown>,
  key: string,
  initialize: () => void,
): boolean {
  if (registry[key] === true) {
    return false;
  }
  registry[key] = true;
  try {
    initialize();
    return true;
  } catch (error: unknown) {
    delete registry[key];
    throw error;
  }
}
