import { platformV2AuthenticatedJsonHeaders } from '@/lib/platform/platformV2Http';
import { platformFetchWithTimeout } from '@/lib/platform/platformFetchWithTimeout';
import { parseShareCommand, parseShareCommandReceipt, parseSharePreview,
  type ShareCommand, type ShareCommandReceipt, type SharePreview, type RejectedShareCommandReceipt } from './shareCommandContract';
import { isCanonicalShareCode } from './shareCode';

export type ShareIntent = Readonly<{userId: string; command: Readonly<ShareCommand>}>;
export type ShareCommandResult =
  | {state: 'committed'; receipt: Exclude<ShareCommandReceipt, {status: 'unknown'|'rejected'}>}
  | {state: 'uncertain'}
  | {state:'rejected';receipt:RejectedShareCommandReceipt};

/** Allocate once per explicit intent; keep this object for every retry/reconciliation. */
export function createShareIntent(userId: string, value: ShareCommand): ShareIntent {
  const command = parseShareCommand(value);
  if (!userId || !command) throw new Error('invalid_share_request');
  return Object.freeze({userId, command: Object.freeze(command)});
}

async function request(userId: string, signal: AbortSignal, url: string, body?: unknown, previewOnly=false) {
  const active = () => {if (signal.aborted) throw new DOMException('Aborted', 'AbortError');};
  active();
  const headers = await platformV2AuthenticatedJsonHeaders(userId);
  active();
  let response: Response | undefined;
  let value: unknown;
  try {
    response = await platformFetchWithTimeout(url, {
      method: body === undefined ? 'GET' : 'POST', headers, signal,
      credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    if (response.ok) value = await response.json();
  } catch {
    // A transport failure does not prove rollback. Never retry automatically.
  }
  await platformV2AuthenticatedJsonHeaders(userId);
  active();
  if(previewOnly&&response?.status===404)throw new Error('share_preview_not_found');
  return response?.ok ? value : undefined;
}

/** Even a rejected retry may follow an earlier committed response that was lost. */
export async function executeShareIntent(intent: ShareIntent, signal: AbortSignal): Promise<ShareCommandResult> {
  const stable = createShareIntent(intent.userId, intent.command);
  const value = await request(stable.userId, signal, '/api/library/collection-sharing/commands', stable.command);
  const receipt = parseShareCommandReceipt(value, stable.command.operationId, stable.command);
  return receipt?.status === 'committed' ? {state: 'committed', receipt} : receipt?.status==='rejected'?{state:'rejected',receipt}:{state:'uncertain'};
}

/** Unknown is still uncertain: an in-flight original request may commit later. */
export async function reconcileShareIntent(intent: ShareIntent, signal: AbortSignal): Promise<ShareCommandResult> {
  const stable = createShareIntent(intent.userId, intent.command);
  const value = await request(stable.userId, signal,
    '/api/library/collection-sharing/reconcile', stable.command);
  const receipt = parseShareCommandReceipt(value, stable.command.operationId, stable.command);
  return receipt?.status === 'committed' ? {state: 'committed', receipt} : receipt?.status==='rejected'?{state:'rejected',receipt}:{state:'uncertain'};
}

export async function previewCollectionShare(userId: string, code: string, signal: AbortSignal): Promise<SharePreview> {
  if (!userId || !isCanonicalShareCode(code)) throw new Error('invalid_share_request');
  const value = await request(userId, signal, '/api/library/collection-sharing/preview', {code}, true);
  const preview = parseSharePreview(value);
  if (!preview) throw new Error('share_preview_unavailable');
  return preview;
}
