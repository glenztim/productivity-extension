import { formatMinutes } from '@/lib/format';
import { distractionShare } from '@/lib/score';
import { poolBalanceSeconds, type DayStats } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';

export default function BreakdownCard({ totals, isToday }: { totals: DayStats | undefined; isToday: boolean }) {
  const pool = useStorageItem(poolBalanceSeconds);
  const good = totals?.goodSeconds ?? 0;
  const neutral = totals?.neutralSeconds ?? 0;
  const bad = totals?.badSeconds ?? 0;
  const share = distractionShare(totals);

  return (
    <div className="breakdown-card">
      <div className="breakdown-cols">
        <div className="day-number"><span className="muted"><i className="dot good" /> Good</span><strong>{formatMinutes(good)}</strong></div>
        <div className="day-number"><span className="muted"><i className="dot neutral" /> Neutral</span><strong>{formatMinutes(neutral)}</strong></div>
        <div className="day-number"><span className="muted"><i className="dot bad" /> Bad</span><strong>{formatMinutes(bad)}</strong></div>
      </div>

      <div className="split-bar" role="img" aria-label="Share of good, neutral and bad time">
        {share !== null && (
          <>
            <div className="seg good" style={{ flexGrow: good }} />
            <div className="seg neutral" style={{ flexGrow: neutral }} />
            <div className="seg bad" style={{ flexGrow: bad }} />
          </>
        )}
      </div>
      <p className="muted">{share === null ? 'No data yet' : `${Math.round(share * 100)}% distraction`}</p>

      {isToday && (
        <div className="day-number pool-row"><span className="muted">Time pool</span><strong>{formatMinutes(pool ?? 0)}</strong></div>
      )}
    </div>
  );
}
