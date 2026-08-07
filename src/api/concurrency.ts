/**
 * Runs `fn` over `items` with at most `concurrency` in flight at once, preserving `items` order
 * in the result. Used wherever we need per-id detail fetches (Discover, Recommendations) — doing
 * them one at a time was the whole reason Discover took ~15s to load; a handful at once cuts that
 * roughly to total-time / concurrency while staying well short of "hammering" MAL's servers.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
