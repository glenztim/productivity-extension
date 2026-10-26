import { useState } from 'react';
import { activeMode, poolBalanceSeconds } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';
import { useNow } from '@/lib/useNow';
import { formatMinutes, formatCountdown } from '@/lib/format';
import { sendMessage } from '@/lib/messages';
import './App.css';

function useQueryParams() {
  const params = new URLSearchParams(location.search);
  return { site: params.get('site') ?? '', reason: params.get('reason') ?? '' };
}

export default function App() {
  const { site, reason } = useQueryParams();
  const mode = useStorageItem(activeMode);
  const pool = useStorageItem(poolBalanceSeconds);
  const now = useNow();
  const [confirmText, setConfirmText] = useState('');

  const openDashboard = () => browser.runtime.openOptionsPage();

  return (
    <div className="blocked">
      <div className="card">
        <h1>🚫 {site || 'This site'} is blocked</h1>

        {reason === 'hardBlock' && mode?.type === 'hardBlock' ? (
          <>
            <p className="muted">You started a hard block. It's fully off-limits until it ends.</p>
            <strong className="countdown">{formatCountdown(mode.endsAt - now)} remaining</strong>
            <div className="cancel-row">
              <input type="text" placeholder="Type CANCEL to end early" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              <button
                className="danger"
                disabled={confirmText.trim().toUpperCase() !== 'CANCEL'}
                onClick={() => sendMessage({ type: 'END_HARD_BLOCK' })}
              >
                Cancel hard block
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Your time pool is empty. Spend time on a productivity site to refill it, or end your session.</p>
            <strong className="countdown">Pool balance: {formatMinutes(pool ?? 0)}</strong>
            <button onClick={() => sendMessage({ type: 'END_SESSION' })}>End session</button>
          </>
        )}

        <button className="link" onClick={openDashboard}>
          Open dashboard
        </button>
      </div>
    </div>
  );
}
