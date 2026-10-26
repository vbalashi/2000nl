import { copyUuid } from '@/lib/platform/independentEntryCopyContract';
import { platformV2AuthenticatedJsonHeaders } from '@/lib/platform/platformV2Http';
import { platformFetchWithTimeout } from '@/lib/platform/platformFetchWithTimeout';
import {
  parseOwnNote, parseOwnNoteCommand, parseOwnNoteWriteResult,
  type OwnNote, type OwnNoteCommand,
} from './noteContract';

export type OwnNoteFailure = 'changed' | 'unavailable' | 'disabled' | 'invalid' | 'uncertain';
export type OwnNoteResult = { state: 'ready'; note: OwnNote } | { state: OwnNoteFailure };

/** No automatic write retry: a lost response may already have committed the CAS. */
async function requestOwnNote(
  userId: string, entryId: string, signal: AbortSignal, command?: OwnNoteCommand,
): Promise<OwnNoteResult> {
  const stableCommand = command === undefined ? undefined : parseOwnNoteCommand(command);
  if (!userId || !copyUuid(entryId) || stableCommand === null) return { state: 'invalid' };
  command = stableCommand;
  const canonicalId = entryId.toLowerCase();
  const assertActive = () => { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); };
  assertActive();
  const headers = await platformV2AuthenticatedJsonHeaders(userId);
  assertActive();
  let response: Response;
  try {
    response = await platformFetchWithTimeout(`/api/library/entries/${canonicalId}/note`, {
      method: command ? 'PUT' : 'GET', credentials: 'same-origin', cache: 'no-store', headers, signal,
      ...(command ? { body: JSON.stringify(command) } : {}),
    });
  } catch {
    assertActive();
    await platformV2AuthenticatedJsonHeaders(userId);
    assertActive();
    return { state: 'uncertain' };
  }
  // Even failures belong to the originating account, never its replacement.
  await platformV2AuthenticatedJsonHeaders(userId);
  assertActive();
  if (!response.ok) {
    if (response.status === 409) return { state: 'changed' };
    if ([401, 403, 404].includes(response.status)) return { state: 'unavailable' };
    if (response.status === 503) return { state: 'disabled' };
    if ([400, 422].includes(response.status)) return { state: 'invalid' };
    return { state: 'uncertain' };
  }
  let value: unknown;
  try { value = await response.json(); } catch { value = null; }
  await platformV2AuthenticatedJsonHeaders(userId);
  assertActive();
  const note = command ? parseOwnNoteWriteResult(value, canonicalId, command) : parseOwnNote(value, canonicalId);
  return note ? { state: 'ready', note } : { state: 'uncertain' };
}

export const readOwnNote = (userId: string, entryId: string, signal: AbortSignal) =>
  requestOwnNote(userId, entryId, signal);
export const writeOwnNote = (userId: string, entryId: string, command: OwnNoteCommand, signal: AbortSignal) =>
  requestOwnNote(userId, entryId, signal, command);
