import { getDayTotals, type StatsSource } from '@/lib/dayStats';
import { lastNDays, localDateKey, WEEKDAY_LABELS } from '@/lib/dateUtils';
import { formatMinutes } from '@/lib/format';
import './WeekSummary.css';

export default function WeekSummary({ stats, onSelectDay }: { stats: StatsSource; onSelectDay: (dateKey: string) => void }) {
  const days = lastNDays(7);

  return (
    <div className="week-summary">
      {days.map((d) => {
        const key = localDateKey(d.getTime());
        const day = getDayTotals(stats, key);
        const good = day?.goodSeconds ?? 0;
        const bad = day?.badSeconds ?? 0;
        const neutral = day?.neutralSeconds ?? 0;
        const total = good + bad + neutral;
        const isToday = key === localDateKey(Date.now());

        return (
          <div
            className={`week-row clickable${isToday ? ' today' : ''}`}
            key={key}
            role="button"
            tabIndex={0}
            onClick={() => onSelectDay(key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectDay(key);
              }
            }}
          >
            <span className="week-label">
              {WEEKDAY_LABELS[d.getDay()]} {d.getMonth() + 1}/{d.getDate()}
            </span>
            <div className="week-bar">
              {total > 0 ? (
                <>
                  <div className="seg good" style={{ flexGrow: good }} title={`Good: ${formatMinutes(good)}`} />
                  <div className="seg neutral" style={{ flexGrow: neutral }} title={`Neutral: ${formatMinutes(neutral)}`} />
                  <div className="seg bad" style={{ flexGrow: bad }} title={`Bad: ${formatMinutes(bad)}`} />
                </>
              ) : (
                <div className="seg empty" style={{ flexGrow: 1 }} />
              )}
            </div>
            <span className="week-total muted">{total > 0 ? formatMinutes(total) : 'no data'}</span>
          </div>
        );
      })}
      <div className="week-legend muted">
        <span><i className="dot good" /> good</span>
        <span><i className="dot neutral" /> neutral</span>
        <span><i className="dot bad" /> bad</span>
      </div>
    </div>
  );
}
