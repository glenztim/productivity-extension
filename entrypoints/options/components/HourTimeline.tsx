import { formatMinutes } from '@/lib/format';
import type { getDayHours } from '@/lib/dayStats';

interface Props {
  /** The day's 24 hourly buckets, or null when only legacy totals (or nothing) exist. */
  hours: ReturnType<typeof getDayHours>;
  /** Whether the day has any tracked time at all; distinguishes "no hourly detail" from an empty day. */
  hasData: boolean;
  currentHour: number | null;
}

const EMPTY_HOURS = Array.from({ length: 24 }, () => ({ goodSeconds: 0, neutralSeconds: 0, badSeconds: 0 }));

export default function HourTimeline({ hours, hasData, currentHour }: Props) {
  if (!hours && hasData) {
    return <p className="day-note muted">No hourly detail for this day — only daily totals were recorded.</p>;
  }
  const buckets = hours ?? EMPTY_HOURS;

  return (
    <div className="timeline" role="group" aria-label="Time per hour">
      <div className="timeline-bars">
        {buckets.map((h, i) => {
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
        {buckets.map((_, i) => (
          <span key={i} className={i === currentHour ? 'current' : ''}>{i % 3 === 0 || i === currentHour ? i : ''}</span>
        ))}
      </div>
    </div>
  );
}
