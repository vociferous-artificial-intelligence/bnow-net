// Recursive freeze for the conflict domain's frozen configuration objects
// (lane taxonomies, the conflict registry, availability tables). Object.freeze
// is shallow; the contract's "frozen" means the whole graph — a consumer that
// tries `CONFLICT_REGISTRY.iran_regional.lanes.push(...)` must throw, not
// silently mutate shared config.

export function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    if (!Object.isFrozen(value)) {
      Object.freeze(value);
      for (const key of Object.getOwnPropertyNames(value)) {
        deepFreeze((value as Record<string, unknown>)[key]);
      }
    }
  }
  return value;
}
