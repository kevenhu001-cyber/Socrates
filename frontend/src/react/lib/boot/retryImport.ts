export function isImportLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message);
}

/** Retry transport/preload failures before replacing an essential surface with
 * recovery UI. Evaluation errors must remain visible rather than run again. */
export async function retryImport<T>(load: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= 2 || !isImportLoadError(error)) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, attempt === 0 ? 250 : 1000));
    }
  }
}
