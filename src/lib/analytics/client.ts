import { sanitizeProductProperties } from "./sanitize";
import type { ProductEventName, ProductEventProperties } from "./events";

export interface AnalyticsClient {
  capture(event: string, properties?: Record<string, unknown>): unknown;
  reset(resetDeviceId?: boolean): void;
  opt_out_capturing(): void;
}

const SESSION_KEY = "bnow_product_session_started";
const RESET_CHANNEL = "bnow_analytics_reset";
const RESET_STORAGE_KEY = "bnow_analytics_reset_signal";
let client: AnalyticsClient | null = null;
let initializationPending = false;
let acceptingCaptures = false;
let initializationGeneration = 0;
const pending: Array<{ name: ProductEventName; properties: Record<string, unknown> }> = [];

export function prepareAnalyticsInitialization(eligible: boolean): number {
  // A changed identity/config/route gate retires the old SDK synchronously before child effects
  // can capture under stale identity. The per-tab session marker is intentionally preserved here.
  try { client?.reset(true); } catch {}
  try { client?.opt_out_capturing(); } catch {}
  client = null;
  initializationGeneration += 1;
  acceptingCaptures = eligible;
  initializationPending = eligible;
  if (!eligible) {
    // Synchronous capture gate: child effects run before the provider's cleanup effect.
    // Retain the client reference so the passive cleanup can reset the SDK, but close capture now.
    pending.length = 0;
  }
  return initializationGeneration;
}

export function isAnalyticsInitializationCurrent(generation: number): boolean {
  return acceptingCaptures && initializationPending && generation === initializationGeneration;
}

export function registerAnalyticsClient(next: AnalyticsClient, generation: number): boolean {
  if (!isAnalyticsInitializationCurrent(generation)) return false;
  client = next;
  initializationPending = false;
  for (const item of pending.splice(0)) client.capture(item.name, item.properties);
  return true;
}

export function clearAnalyticsClient(): void {
  initializationGeneration += 1;
  client = null;
  acceptingCaptures = false;
  initializationPending = false;
  pending.length = 0;
}

export function failAnalyticsInitialization(generation: number): void {
  if (generation === initializationGeneration) clearAnalyticsClient();
}

export function captureProductEvent<K extends ProductEventName>(
  name: K,
  properties: ProductEventProperties[K],
): void {
  try {
    const safe = sanitizeProductProperties(name, properties);
    if (!safe) return;
    if (acceptingCaptures && client) client.capture(name, safe as Record<string, unknown>);
    else if (initializationPending && pending.length < 32) pending.push({ name, properties: safe as Record<string, unknown> });
  } catch {
    // Telemetry may be lost; product behavior may not be.
  }
}

export function captureManualPageview(normalizedPath: string, entrySurface: string): void {
  try {
    if (acceptingCaptures && client) {
      client.capture("$pageview", {
        normalized_path: normalizedPath,
        entry_surface: entrySurface,
      });
    }
  } catch {
    // Telemetry may be lost; navigation may not be.
  }
}

function broadcastAnalyticsReset(): void {
  try {
    const channel = new BroadcastChannel(RESET_CHANNEL);
    channel.postMessage("reset");
    channel.close();
  } catch {
    try {
      window.localStorage.setItem(RESET_STORAGE_KEY, "reset");
      window.localStorage.removeItem(RESET_STORAGE_KEY);
    } catch {}
  }
}

export function installAnalyticsResetListener(onReset?: () => void): () => void {
  const resetWithoutRebroadcast = () => {
    resetAnalyticsClient(true, false);
    onReset?.();
  };
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(RESET_CHANNEL);
    channel.addEventListener("message", resetWithoutRebroadcast);
  } catch {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === RESET_STORAGE_KEY && event.newValue === "reset") resetWithoutRebroadcast();
  };
  try { window.addEventListener("storage", onStorage); } catch {}
  return () => {
    try { channel?.removeEventListener("message", resetWithoutRebroadcast); } catch {}
    try { channel?.close(); } catch {}
    try { window.removeEventListener("storage", onStorage); } catch {}
  };
}

export function resetAnalyticsClient(clearSessionGuard = true, broadcastReset = true): void {
  initializationGeneration += 1;
  acceptingCaptures = false;
  initializationPending = false;
  pending.length = 0;
  try { client?.reset(true); } catch {}
  try { client?.opt_out_capturing(); } catch {}
  if (clearSessionGuard) {
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch {}
  }
  client = null;
  if (broadcastReset) broadcastAnalyticsReset();
}

export function shouldStartProductSession(): boolean {
  try {
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return false;
    window.sessionStorage.setItem(SESSION_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

export const analyticsSessionStorageKey = SESSION_KEY;
