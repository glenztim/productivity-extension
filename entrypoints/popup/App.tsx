import { useEffect, useState } from 'react';
import { activeMode, poolBalanceSeconds, settings, checkpoint } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';
import { useDailyStats } from '@/lib/useDailyStats';
import { getDayTotals } from '@/lib/dayStats';
import { useNow } from '@/lib/useNow';
import { localDateKey } from '@/lib/dateUtils';
import { formatMinutes, formatClock, formatCountdown } from '@/lib/format';
import { interpolatePool, interpolateGoodSecondsToday } from '@/lib/liveStats';
import { sendMessage } from '@/lib/messages';
import './App.css';

export default function App() {
  const mode = useStorageItem(activeMode);
  const pool = useStorageItem(poolBalanceSeconds);
  const stats = useDailyStats();
  const config = useStorageItem(settings);
  const cp = useStorageItem(checkpoint);
  const now = useNow();

  useEffect(() => {
    sendMessage({ type: 'SYNC' });
  }, []);

  const today = stats && getDayTotals(stats, localDateKey(Date.now()));
  const goodSecondsToday = today?.goodSeconds ?? 0;

  const displayedPool = mode && cp && config ? interpolatePool(pool ?? 0, mode, cp, config, now) : pool ?? 0;
  const displayedGoodToday = cp ? interpolateGoodSecondsToday(goodSecondsToday, cp, now) : goodSecondsToday;

  const openDashboard = () => browser.runtime.openOptionsPage();

  return (
    <div className="popup">
      <header>
        <h1>Focus Pool</h1>
        <button className="link" onClick={openDashboard}>
          Dashboard
        </button>
      </header>

      <div className="stats-row">
        <div className="stat card">
          <span className="muted">Time pool</span>
          <strong className="ticking">{formatClock(displayedPool)}</strong>
        </div>
        <div className="stat card">
          <span className="muted">Good time today</span>
          <strong className="ticking">{formatClock(displayedGoodToday)}</strong>
        </div>
      </div>

      {!mode || mode.type === 'free' ? (
        <FreeModeControls shortMinutes={config?.shortSessionMinutes ?? 120} longMinutesDefault={config?.longSessionMinutesDefault ?? 240} hardBlockMinutesDefault={config?.hardBlockMinutesDefault ?? 60} />
      ) : mode.type === 'session' ? (
        <SessionControls kind={mode.kind} startedAt={mode.startedAt} endsAt={mode.endsAt} now={now} />
      ) : (
        <HardBlockControls startedAt={mode.startedAt} endsAt={mode.endsAt} now={now} />
      )}
    </div>
  );
}

function FreeModeControls({
  shortMinutes,
  longMinutesDefault,
  hardBlockMinutesDefault,
}: {
  shortMinutes: number;
  longMinutesDefault: number;
  hardBlockMinutesDefault: number;
}) {
  const [longMinutes, setLongMinutes] = useState(longMinutesDefault);
  const [hardMinutes, setHardMinutes] = useState(hardBlockMinutesDefault);

  useEffect(() => setLongMinutes(longMinutesDefault), [longMinutesDefault]);
  useEffect(() => setHardMinutes(hardBlockMinutesDefault), [hardBlockMinutesDefault]);

  return (
    <div className="actions">
      <p className="muted">You're in free mode — nothing is blocked. Start a session to bank pool time and gate access to your blocklist.</p>

      <button className="primary" onClick={() => sendMessage({ type: 'START_SESSION', kind: 'short' })}>
        Start short session ({formatMinutes(shortMinutes * 60)})
      </button>

      <div className="action-with-input">
        <button className="primary" onClick={() => sendMessage({ type: 'START_SESSION', kind: 'long', durationMinutes: longMinutes })}>
          Start long session
        </button>
        <input
          type="number"
          min={1}
          value={longMinutes}
          onChange={(e) => setLongMinutes(Number(e.target.value))}
        />
        <span className="muted">min</span>
      </div>

      <div className="action-with-input">
        <button className="danger" onClick={() => sendMessage({ type: 'START_HARD_BLOCK', durationMinutes: hardMinutes })}>
          Start hard block
        </button>
        <input
          type="number"
          min={1}
          value={hardMinutes}
          onChange={(e) => setHardMinutes(Number(e.target.value))}
        />
        <span className="muted">min</span>
      </div>
    </div>
  );
}

function SessionControls({ kind, startedAt, endsAt, now }: { kind: 'short' | 'long'; startedAt: number; endsAt: number; now: number }) {
  return (
    <div className="actions">
      <div className="card status-card">
        <span className="muted">{kind === 'short' ? 'Short' : 'Long'} session active</span>
        <strong>{formatCountdown(endsAt - now)} remaining</strong>
        <span className="muted elapsed">{formatClock((now - startedAt) / 1000)} elapsed</span>
      </div>
      <p className="muted">Browsing good sites banks pool time; browsing blocklisted sites spends it. You'll be blocked once the pool hits zero.</p>
      <button onClick={() => sendMessage({ type: 'END_SESSION' })}>End session</button>
    </div>
  );
}

function HardBlockControls({ startedAt, endsAt, now }: { startedAt: number; endsAt: number; now: number }) {
  const [confirmText, setConfirmText] = useState('');
  const canCancel = confirmText.trim().toUpperCase() === 'CANCEL';

  return (
    <div className="actions">
      <div className="card status-card">
        <span className="muted">Hard block active</span>
        <strong>{formatCountdown(endsAt - now)} remaining</strong>
        <span className="muted elapsed">{formatClock((now - startedAt) / 1000)} elapsed</span>
      </div>
      <p className="muted">Your blocklist is fully inaccessible until this ends. Type CANCEL below to end it early.</p>
      <div className="action-with-input">
        <input type="text" placeholder="Type CANCEL" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        <button className="danger" disabled={!canCancel} onClick={() => sendMessage({ type: 'END_HARD_BLOCK' })}>
          Cancel hard block
        </button>
      </div>
    </div>
  );
}
