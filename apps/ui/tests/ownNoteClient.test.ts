import { beforeEach, expect, test, vi } from 'vitest';
const transport = vi.hoisted(() => ({ headers: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/platform/platformV2Http', () => ({ platformV2AuthenticatedJsonHeaders: transport.headers }));
vi.mock('@/lib/platform/platformFetchWithTimeout', () => ({ platformFetchWithTimeout: transport.fetch }));
import { readOwnNote, writeOwnNote } from '@/lib/collections/sharing/ownNoteClient';
const entryId = 'f0efc621-f785-4281-91c1-b1bbf2160180';
const command = { expectedRevision: '9007199254740993', notes: 'My text' };
const note = { entryId, revision: '9007199254740994', notes: 'My text' };
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks(); transport.headers.mockResolvedValue({ authorization: 'Bearer test' });
  transport.fetch.mockResolvedValue(Response.json(note));
});
test('reads only the exact own note, uncached, with the original account checked after parsing', async () => {
  expect(await readOwnNote('reader', entryId.toUpperCase(), signal())).toEqual({ state: 'ready', note });
  expect(transport.fetch).toHaveBeenCalledWith(`/api/library/entries/${entryId}/note`, expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }));
  expect(transport.headers).toHaveBeenCalledTimes(3);
});
test('writes exact decimal CAS and explicit text without sending an owner identity', async () => {
  expect(await writeOwnNote('reader', entryId, command, signal())).toEqual({ state: 'ready', note });
  expect(JSON.parse(transport.fetch.mock.calls[0][1].body)).toEqual(command);
});
test('deletion preserves the acknowledged absence revision', async () => {
  transport.fetch.mockResolvedValueOnce(Response.json({ ...note, notes: null }));
  expect(await writeOwnNote('reader', entryId, { ...command, notes: null }, signal())).toEqual({ state: 'ready', note: { ...note, notes: null } });
});
test.each([[409, 'changed'], [404, 'unavailable'], [503, 'disabled'], [422, 'invalid'], [500, 'uncertain']] as const)('classifies HTTP %s without retrying or exposing error text', async (status, state) => {
  transport.fetch.mockResolvedValueOnce(new Response('sensitive backend detail', { status }));
  expect(await writeOwnNote('reader', entryId, command, signal())).toEqual({ state });
  expect(transport.fetch).toHaveBeenCalledOnce();
});
test('lost write acknowledgement remains uncertain and is never automatically repeated', async () => {
  transport.fetch.mockRejectedValueOnce(new Error('network failed after commit'));
  expect(await writeOwnNote('reader', entryId, command, signal())).toEqual({ state: 'uncertain' });
  expect(transport.fetch).toHaveBeenCalledOnce();
});
test.each([{ ...note, revision: '9007199254740995' }, { ...note, notes: 'Other text' }, { ...note, entryId: 'other' }])('does not accept a mismatched acknowledgement %#', async value => {
  transport.fetch.mockResolvedValueOnce(Response.json(value));
  expect(await writeOwnNote('reader', entryId, command, signal())).toEqual({ state: 'uncertain' });
});
test('rejects invalid commands before authentication or network', async () => {
  expect(await writeOwnNote('reader', entryId, { ...command, expectedRevision: '01' }, signal())).toEqual({ state: 'invalid' });
  expect(transport.headers).not.toHaveBeenCalled(); expect(transport.fetch).not.toHaveBeenCalled();
});
test('a switched account cannot receive even a successful old-account acknowledgement', async () => {
  transport.headers.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('auth_account_changed'));
  await expect(writeOwnNote('reader', entryId, command, signal())).rejects.toThrow('auth_account_changed');
  expect(transport.fetch).toHaveBeenCalledOnce();
});
test('abort during body parsing suppresses a late successful write result', async () => {
  const controller = new AbortController();
  transport.fetch.mockResolvedValueOnce({ ok: true, json: async () => { controller.abort(); return note; } });
  await expect(writeOwnNote('reader', entryId, command, controller.signal)).rejects.toThrow('Aborted');
});

test('captures the intended draft before asynchronous authentication', async () => {
  const mutable = { ...command };
  let release!: (headers: object) => void;
  transport.headers.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const pending = writeOwnNote('reader', entryId, mutable, signal());
  mutable.notes = 'A later draft'; mutable.expectedRevision = '2';
  release({});
  expect(await pending).toEqual({ state: 'ready', note });
  expect(JSON.parse(transport.fetch.mock.calls[0][1].body)).toEqual(command);
});
