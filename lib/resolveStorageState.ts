import type { SessionStorageState, StorageState } from './types';

const STORAGE_STATE_ERROR =
  '"storageState" must be a Playwright storage-state JSON object (with "cookies" and "origins" arrays), or a JSON string of one.';

const SESSION_STORAGE_STATE_ERROR =
  '"sessionStorageState" must be an array of { "origin", "sessionStorage": [{ "name", "value" }] } objects (see captureLoginStorageState\'s output), or a JSON string of one.';

/**
 * Validates /api/scan's optional `storageState` field. Accepts either an
 * already-parsed object (the normal case, since the whole request body is
 * JSON) or a raw JSON string (in case a caller pastes the exported file's
 * contents in without parsing it first).
 *
 * Deliberately only checks for the two arrays Playwright's own
 * `context.storageState()` export always has - not every cookie field - so
 * a real export is accepted as-is and Playwright itself is what rejects
 * anything more deeply malformed when the browser context is created.
 */
export function resolveStorageState(input: unknown): { value?: StorageState; error?: string } {
  if (input === undefined || input === null || input === '') return {};
  if (typeof input === 'string') {
    try {
      return resolveStorageState(JSON.parse(input));
    } catch {
      return { error: STORAGE_STATE_ERROR };
    }
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { error: STORAGE_STATE_ERROR };
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.cookies) || !Array.isArray(obj.origins)) {
    return { error: STORAGE_STATE_ERROR };
  }
  return { value: input as StorageState };
}

/**
 * Validates /api/scan's optional `sessionStorageState` field - the
 * sessionStorage counterpart lib/sessionStorageState.ts captures and
 * restores, since Playwright's own storageState() never covers
 * sessionStorage at all (see lib/types.ts's SessionStorageState comment).
 * Same acceptance rules as resolveStorageState above: an already-parsed
 * array, or a raw JSON string of one.
 */
export function resolveSessionStorageState(input: unknown): { value?: SessionStorageState; error?: string } {
  if (input === undefined || input === null || input === '') return {};
  if (typeof input === 'string') {
    try {
      return resolveSessionStorageState(JSON.parse(input));
    } catch {
      return { error: SESSION_STORAGE_STATE_ERROR };
    }
  }
  if (!Array.isArray(input)) {
    return { error: SESSION_STORAGE_STATE_ERROR };
  }
  for (const entry of input) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).origin !== 'string' ||
      !Array.isArray((entry as Record<string, unknown>).sessionStorage)
    ) {
      return { error: SESSION_STORAGE_STATE_ERROR };
    }
    for (const kv of (entry as Record<string, unknown>).sessionStorage as unknown[]) {
      if (
        typeof kv !== 'object' ||
        kv === null ||
        typeof (kv as Record<string, unknown>).name !== 'string' ||
        typeof (kv as Record<string, unknown>).value !== 'string'
      ) {
        return { error: SESSION_STORAGE_STATE_ERROR };
      }
    }
  }
  return { value: input as SessionStorageState };
}
