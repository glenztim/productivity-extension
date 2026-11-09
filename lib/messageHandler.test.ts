import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Browser } from 'wxt/browser';
import { handleIncoming, registerMessageHandlers, senderKind } from './messageHandler';
import { activeMode, dayEvents, poolBalanceSeconds } from './storage';
import { getState, type Reply } from './messages';

const TODAY = '2025-06-10';

type Sender = Browser.runtime.MessageSender;
const ownId = () => fakeBrowser.runtime.id;
const extensionPage = (): Sender => ({ id: ownId(), url: fakeBrowser.runtime.getURL('/popup.html') });
const contentScript = (): Sender => ({
  id: ownId(),
  url: 'https://example.com/some/page',
  tab: { id: 5, index: 0, active: true, pinned: false, highlighted: true, incognito: false },
} as Sender);
const stranger = (): Sender => ({ id: 'someone-else@example.com', url: fakeBrowser.runtime.getURL('/popup.html') });

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2025, 5, 10, 9, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('senderKind', () => {
  it('recognises our own pages and our content scripts', () => {
    expect(senderKind(extensionPage())).toBe('extension-page');
    expect(senderKind(contentScript())).toBe('content-script');
  });

  it('treats an own-extension sender with neither url nor tab as an extension page', () => {
    expect(senderKind({ id: ownId() })).toBe('extension-page');
  });

  it.each([
    ['no sender', undefined],
    ['another extension', stranger()],
    ['no id', { url: fakeBrowser.runtime.getURL('/popup.html') }],
    ['an empty id', { id: '', url: fakeBrowser.runtime.getURL('/popup.html') }],
  ])('refuses %s', (_label, sender) => {
    expect(senderKind(sender as Sender | undefined)).toBeNull();
  });

  it('refuses our id with a tab but no url', () => {
    expect(senderKind({ id: ownId(), tab: contentScript().tab })).toBeNull();
  });
});

describe('valid messages', () => {
  it('RECORD_EVENT adds to today, with the day taken from the background clock', async () => {
    expect(await handleIncoming({ type: 'RECORD_EVENT', name: 'unlocksUsed' }, extensionPage())).toEqual({ ok: true });
    expect(await handleIncoming({ type: 'RECORD_EVENT', name: 'xpEarned', amount: 25 }, extensionPage())).toEqual({ ok: true });
    expect(await handleIncoming({ type: 'RECORD_EVENT', name: 'xpEarned', amount: 5 }, extensionPage())).toEqual({ ok: true });
    expect((await dayEvents.getValue())[TODAY]).toEqual({ unlocksUsed: 1, xpEarned: 30 });
  });

  it('RECORD_EVENT writes go through the lock: concurrent messages lose no updates', async () => {
    const replies = await Promise.all(
      Array.from({ length: 25 }, () => handleIncoming({ type: 'RECORD_EVENT', name: 'unlocksUsed' }, extensionPage())),
    );
    expect(replies.every((r) => r.ok)).toBe(true);
    expect((await dayEvents.getValue())[TODAY]?.unlocksUsed).toBe(25);
  });

  it('GET_STATE returns mode, pool and only today\'s counters', async () => {
    await poolBalanceSeconds.setValue(123);
    await activeMode.setValue({ type: 'hardBlock', startedAt: 1, endsAt: 2 });
    await dayEvents.setValue({ [TODAY]: { unlocksUsed: 2 }, '2025-06-09': { unlocksUsed: 9 } });

    const reply = await handleIncoming({ type: 'GET_STATE' }, extensionPage());
    expect(reply).toEqual({
      ok: true,
      state: { mode: { type: 'hardBlock', startedAt: 1, endsAt: 2 }, poolSeconds: 123, today: { unlocksUsed: 2 } },
    });
  });

  it('GET_STATE on a fresh install is a free mode with nothing recorded', async () => {
    const reply = await handleIncoming({ type: 'GET_STATE' }, extensionPage());
    expect(reply).toEqual({ ok: true, state: { mode: { type: 'free' }, poolSeconds: 0, today: {} } });
  });

  it('START_SESSION and END_SESSION still work from an extension page', async () => {
    expect(await handleIncoming({ type: 'START_SESSION', kind: 'long', durationMinutes: 30 }, extensionPage())).toEqual({ ok: true });
    const mode = await activeMode.getValue();
    expect(mode).toMatchObject({ type: 'session', kind: 'long' });
    expect((await fakeBrowser.alarms.get('sessionEnd'))?.scheduledTime).toBe(Date.now() + 30 * 60_000);

    expect(await handleIncoming({ type: 'END_SESSION' }, extensionPage())).toEqual({ ok: true });
    expect(await activeMode.getValue()).toEqual({ type: 'free' });
    expect(await fakeBrowser.alarms.get('sessionEnd')).toBeUndefined();
  });

  it('START_HARD_BLOCK and END_HARD_BLOCK still work from an extension page', async () => {
    expect(await handleIncoming({ type: 'START_HARD_BLOCK', durationMinutes: 45 }, extensionPage())).toEqual({ ok: true });
    expect(await activeMode.getValue()).toMatchObject({ type: 'hardBlock' });
    expect(await handleIncoming({ type: 'END_HARD_BLOCK' }, extensionPage())).toEqual({ ok: true });
    expect(await activeMode.getValue()).toEqual({ type: 'free' });
  });

  it('SYNC is accepted', async () => {
    expect(await handleIncoming({ type: 'SYNC' }, extensionPage())).toEqual({ ok: true });
  });
});

describe('invalid messages', () => {
  const bad: unknown[] = [
    undefined,
    null,
    'RECORD_EVENT',
    { type: 'NOPE' },
    { type: 'RECORD_EVENT', name: 'goalReached' },
    { type: 'RECORD_EVENT', name: 'unlocksUsed', amount: -4 },
    { type: 'RECORD_EVENT', name: 'unlocksUsed', dateKey: '2020-01-01' },
    { type: 'START_HARD_BLOCK', durationMinutes: 1e12 },
    { type: 'START_HARD_BLOCK', durationMinutes: NaN },
    { type: 'START_SESSION', kind: 'short', durationMinutes: 5 },
  ];

  it.each(bad.map((m) => [JSON.stringify(m) ?? 'undefined', m]))('rejects %s without touching anything', async (_label, msg) => {
    const reply = await handleIncoming(msg, extensionPage());
    expect(reply).toEqual({ ok: false, error: 'invalid-message' });
    expect(await dayEvents.getValue()).toEqual({});
    expect(await activeMode.getValue()).toEqual({ type: 'free' });
    expect(await fakeBrowser.alarms.getAll()).toEqual([]);
  });
});

describe('unknown senders', () => {
  it.each([
    ['another extension', stranger()],
    ['no sender', undefined],
    ['a sender without id', { url: fakeBrowser.runtime.getURL('/popup.html') } as Sender],
  ])('%s is refused even for a valid message', async (_label, sender) => {
    const reply = await handleIncoming({ type: 'RECORD_EVENT', name: 'unlocksUsed' }, sender);
    expect(reply).toEqual({ ok: false, error: 'untrusted-sender' });
    expect(await dayEvents.getValue()).toEqual({});
  });

  it('is refused before the message is even looked at', async () => {
    expect(await handleIncoming({ garbage: true }, stranger())).toEqual({ ok: false, error: 'untrusted-sender' });
  });

  it('a content script may record events and read state', async () => {
    expect(await handleIncoming({ type: 'RECORD_EVENT', name: 'unlocksUsed' }, contentScript())).toEqual({ ok: true });
    expect((await dayEvents.getValue())[TODAY]).toEqual({ unlocksUsed: 1 });
    const state = await handleIncoming({ type: 'GET_STATE' }, contentScript());
    expect(state.ok && state.state?.today).toEqual({ unlocksUsed: 1 });
  });

  it.each([
    [{ type: 'START_SESSION', kind: 'short' }],
    [{ type: 'START_HARD_BLOCK', durationMinutes: 60 }],
    [{ type: 'END_SESSION' }],
    [{ type: 'END_HARD_BLOCK' }],
    [{ type: 'SYNC' }],
  ])('a content script may not send %j', async (msg) => {
    await activeMode.setValue({ type: 'hardBlock', startedAt: 1, endsAt: Date.now() + 60_000 });
    const reply = await handleIncoming(msg, contentScript());
    expect(reply).toEqual({ ok: false, error: 'untrusted-sender' });
    expect(await activeMode.getValue()).toMatchObject({ type: 'hardBlock', startedAt: 1 });
  });
});

describe('failures', () => {
  it('answers { ok: false, error: "failed" } instead of rejecting, and logs the type and error name only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(activeMode, 'setValue').mockRejectedValue(new Error('disk full'));
    const reply = await handleIncoming({ type: 'START_HARD_BLOCK', durationMinutes: 60 }, extensionPage());
    expect(reply).toEqual({ ok: false, error: 'failed' });
    expect(log.mock.calls).toEqual([['Message START_HARD_BLOCK failed (Error)']]);
  });
});

describe('registered listener', () => {
  it('answers through runtime.onMessage with the sender the browser provides', async () => {
    registerMessageHandlers();
    const send = async (msg: unknown, sender: Sender) =>
      Promise.all(await fakeBrowser.runtime.onMessage.trigger(msg, sender, () => {})) as Promise<Reply[]>;

    const replies = await send({ type: 'GET_STATE' }, extensionPage());
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ ok: true });

    const refused = await send({ type: 'GET_STATE' }, stranger());
    expect(refused[0]).toEqual({ ok: false, error: 'untrusted-sender' });
  });

  it('getState() resolves with the snapshot and throws when refused', async () => {
    registerMessageHandlers();
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation((async (m: unknown) => handleIncoming(m, extensionPage())) as never);
    await expect(getState()).resolves.toEqual({ mode: { type: 'free' }, poolSeconds: 0, today: {} });

    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({ ok: false, error: 'untrusted-sender' } as never);
    await expect(getState()).rejects.toThrow('untrusted-sender');
  });
});
