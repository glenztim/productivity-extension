import { activeMode, settings } from './storage';
import { flush, recomputeCurrentActivity } from './accounting';
import { enforceBlockingAcrossAllTabs } from './blocking';

export type Message =
  | { type: 'SYNC' }
  | { type: 'START_SESSION'; kind: 'short' | 'long'; durationMinutes?: number }
  | { type: 'END_SESSION' }
  | { type: 'START_HARD_BLOCK'; durationMinutes: number }
  | { type: 'END_HARD_BLOCK' };

export async function sendMessage(message: Message): Promise<{ ok: true }> {
  return browser.runtime.sendMessage(message);
}

export function registerMessageHandlers(): void {
  browser.runtime.onMessage.addListener((msg: Message) => {
    return handleMessage(msg);
  });
}

async function handleMessage(msg: Message): Promise<{ ok: true }> {
  switch (msg.type) {
    case 'SYNC': {
      await flush();
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
