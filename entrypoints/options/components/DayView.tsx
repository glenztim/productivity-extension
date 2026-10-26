import { getDayHours, getDayTotals, type StatsSource } from '@/lib/dayStats';
import { localDateKey, parseDateKey, shiftDateKey } from '@/lib/dateUtils';
import { bucketScore, computeDayScore, type ScoreBucket } from '@/lib/score';
import { formatMinutes } from '@/lib/format';
import { DEFAULT_DAILY_TARGET_MINUTES, poolBalanceSeconds, settings } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';
import { useNow } from '@/lib/useNow';
import './DayView.css';

const BUCKET_LABELS: Record<ScoreBucket, string> = {
  excellent: 'Excellent',
  good: 'Good',
  neutral: 'Mixed',
  poor: 'Poor',
  bad: 'Bad',
  none: 'No data',
};

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface Props {
  stats: StatsSource;
  /** Selected 'YYYY-MM-DD', or null to follow today (also across midnight). */
  dateKey: string | null;
  onChange: (dateKey: string | null) => void;
}

export default function DayView({ stats, dateKey, onChange }: Props) {
  const now = useNow(30_000);
  const config = useStorageItem(settings);
  const pool = useStorageItem(poolBalanceSeconds);

  const todayKey = localDateKey(now);
  const key = dateKey ?? todayKey;
  const isToday = key === todayKey;
  const currentHour = new Date(now).getHours();

  const totals = getDayTotals(stats, key);
  const hours = getDayHours(stats, key);
  const score = computeDayScore(totals);
  const bucket = bucketScore(score);
  const hasData = !!totals && totals.goodSeconds + totals.badSeconds + totals.neutralSeconds > 0;

  const targetSeconds = (config?.dailyGoodTargetMinutes ?? DEFAULT_DAILY_TARGET_MINUTES) * 60;
  const progress = Math.min(1, (totals?.goodSeconds ?? 0) / targetSeconds);

  const go = (next: string) => onChange(next >= todayKey ? null : next);

  return (
    <div className="day-view">
      <div className="day-nav">
        <button onClick={() => go(shiftDateKey(key, -1))} aria-label="Previous day">&larr;</button>
        <strong>
          {parseDateKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </strong>
        <button onClick={() => go(shiftDateKey(key, 1))} disabled={isToday} aria-label="Next day">&rarr;</button>
        <button onClick={() => onChange(null)} disabled={isToday}>Today</button>
      </div>

      {!hasData || !totals ? (
        <p className="day-empty muted">{isToday ? 'Nothing tracked yet today.' : 'Nothing was tracked on this day.'}</p>
      ) : (
        <>
          <div className="day-summary">
            <div className="day-ring" role="img" aria-label={`${Math.round(progress * 100)}% of the daily good-time target`}>
              <svg viewBox="0 0 120 120">
                <circle className="ring-track" cx="60" cy="60" r={RING_RADIUS} />
                <circle
                  className="ring-fill"
                  cx="60"
                  cy="60"
                  r={RING_RADIUS}
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <div className="ring-label">
                <strong>{formatMinutes(totals.goodSeconds)}</strong>
                <span className="muted">of {formatMinutes(targetSeconds)}</span>
              </div>
            </div>

            <div className="day-numbers">
              <div className="day-number"><span className="muted"><i className="dot good" /> Good</span><strong>{formatMinutes(totals.goodSeconds)}</strong></div>
              <div className="day-number"><span className="muted"><i className="dot neutral" /> Neutral</span><strong>{formatMinutes(totals.neutralSeconds)}</strong></div>
              <div className="day-number"><span className="muted"><i className="dot bad" /> Bad</span><strong>{formatMinutes(totals.badSeconds)}</strong></div>
              <div className="day-number">
                <span className="muted">Day score</span>
                <strong>
                  <span className={`score-pill bucket-${bucket}`}>{BUCKET_LABELS[bucket]}</span>
                  {score !== null && <span className="score-value"> {score > 0 ? '+' : ''}{Math.round(score * 100)}</span>}
                </strong>
              </div>
              {isToday && (
                <div className="day-number"><span className="muted">Time pool</span><strong>{formatMinutes(pool ?? 0)}</strong></div>
              )}
            </div>
          </div>

          {hours ? (
            <HourTimeline hours={hours} currentHour={isToday ? currentHour : null} />
          ) : (
            <p className="day-note muted">No hourly detail for this day — only daily totals were recorded.</p>
          )}
        </>
      )}
    </div>
  );
}

function HourTimeline({ hours, currentHour }: { hours: NonNullable<ReturnType<typeof getDayHours>>; currentHour: number | null }) {
  return (
    <div className="timeline" role="group" aria-label="Time per hour">
      <div className="timeline-bars">
        {hours.map((h, i) => {
          const total = h.goodSeconds + h.neutralSeconds + h.badSeconds;
          const label = `${String(i).padStart(2, '0')}:00 — Good ${formatMinutes(h.goodSeconds)}, Neutral ${formatMinutes(h.neutralSeconds)}, Bad ${formatMinutes(h.badSeconds)}`;
          return (
            <div
              key={i}
              className={`timeline-col${i === currentHour ? ' current' : ''}${currentHour !== null && i > currentHour ? ' future' : ''}`}
              title={label}
              aria-label={label}
            >
              <div className="timeline-stack" style={{ height: `${Math.min(1, total / 3600) * 100}%` }}>
                <div className="seg bad" style={{ flexGrow: h.badSeconds }} />
                <div className="seg neutral" style={{ flexGrow: h.neutralSeconds }} />
                <div className="seg good" style={{ flexGrow: h.goodSeconds }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="timeline-axis muted">
        {hours.map((_, i) => (
          <span key={i} className={i === currentHour ? 'current' : ''}>{i % 3 === 0 || i === currentHour ? i : ''}</span>
        ))}
      </div>
    </div>
  );
}
