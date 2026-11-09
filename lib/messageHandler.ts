import type { Browser } from 'wxt/browser';
import { activeMode, dayEvents, poolBalanceSeconds, settings } from './storage';
import { flush, recomputeCurrentActivity } from './accounting';
import { enforceBlockingAcrossAllTabs } from './blocking';
import { recordEvent } from './dayEvents';
import { localDateKey } from './dateUtils';
import { logError } from './logError';
import { parseMessage, type Message, type MessageType, type Reply } from './messages';

type Sender = Browser.runtime.MessageSender;
type SenderKind = 'extension-page' | 'content-script';

/** What a content script may ask for. Everything else (starting or ending modes) needs one of our own pages. */
const CONTENT_SCRIPT_MESSAGES: ReadonlySet<MessageType> = new Set<MessageType>(['RECORD_EVENT', 'GET_STATE']);

/**
 * Who sent this? Only our own extension is accepted (`sender.id`). Our pages are told apart from
 * content scripts by the URL they run at. Anything else is unknown and gets refused.
 */
export function senderKind(sender: Sender | undefined): SenderKind | null {
  if (!sender || sender.id !== browser.runtime.id) return null;
  if (sender.url?.startsWith(browser.runtime.getURL('/'))) return 'extension-page';
  if (sender.tab && sender.url) return 'content-script';
  // An extension context (e.g. the popup) that reports neither url nor tab. Content scripts always have a tab.
  if (!sender.tab && !sender.url) return 'extension-page';
  return null;
}

/** Validates the sender and the message, then runs it. Never rejects: failures become an error reply. */
export async function handleIncoming(raw: unknown, sender: Sender | undefined): Promise<Reply> {
  const kind = senderKind(sender);
  if (!kind) return { ok: false, error: 'untrusted-sender' };

  const msg = parseMessage(raw);
  if (!msg) return { ok: false, error: 'invalid-message' };
  if (kind === 'content-script' && !CONTENT_SCRIPT_MESSAGES.has(msg.type)) return { ok: false, error: 'untrusted-sender' };

  try {
    return await handleMessage(msg);
  } catch (err) {
    // Message type only: never the payload or sender, which could carry a page URL.
    logError(`Message ${msg.type} failed`, err);
    return { ok: false, error: 'failed' };
  }
}

export function registerMessageHandlers(): void {
  browser.runtime.onMessage.addListener((raw: unknown, sender: Sender) => handleIncoming(raw, sender));
}

/** Runs an already validated message. */
async function handleMessage(msg: Message): Promise<Reply> {
  switch (msg.type) {
    case 'SYNC': {
      await flush();
      return { ok: true };
    }
    case 'GET_STATE': {
      const [mode, poolSeconds, events] = await Promise.all([activeMode.getValue(), poolBalanceSeconds.getValue(), dayEvents.getValue()]);
      return { ok: true, state: { mode, poolSeconds, today: events[localDateKey(Date.now())] ?? {} } };
    }
    case 'RECORD_EVENT': {
      // The date comes from the background's clock, never from the sender, and the write goes through
      // the same lock as every other storage write.
      await recordEvent(localDateKey(Date.now()), msg.name, msg.amount ?? 1);
      return { ok: true };
    }
    case 'START_SESSION': {
      const s = await settings.getValue();
      const minutes = msg.kind === 'short' ? s.shortSessionMinutes : msg.durationMinutes ?? s.longSessionMinutesDefault;
      await flush();
      const startedAt = Date.now();
      const endsAt = startedAt + minutes * 60_000;
      await activeMode.setValue({ type: 'session', kind: msg.kind, startedAt, endsAt });
      await browser.alarms.create('sessionEnd', { when: endsAt });
      await recomputeCurrentActivity();
      await enforceBlockingAcrossAllTabs();
      return { ok: true };
    }
    case 'END_SESSION': {
      await flush();
      await activeMode.setValue({ type: 'free' });
      await browser.alarms.clear('sessionEnd');
      await browser.alarms.clear('depletion');
      await browser.alarms.clear('heartbeat');
      await recomputeCurrentActivity();
      return { ok: true };
    }
    case 'START_HARD_BLOCK': {
      await flush();
      const startedAt = Date.now();
      const endsAt = startedAt + msg.durationMinutes * 60_000;
      await activeMode.setValue({ type: 'hardBlock', startedAt, endsAt });
      await browser.alarms.create('hardBlockEnd', { when: endsAt });
      await recomputeCurrentActivity();
      await enforceBlockingAcrossAllTabs();
      return { ok: true };
    }
    case 'END_HARD_BLOCK': {
      // Friction (typed confirmation) is enforced client-side before this message is ever sent.
      await flush();
      await activeMode.setValue({ type: 'free' });
      await browser.alarms.clear('hardBlockEnd');
      await browser.alarms.clear('heartbeat');
      await recomputeCurrentActivity();
      return { ok: true };
    }
  }
}
