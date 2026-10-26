import { useState } from 'react';
import { getDayTotals, type StatsSource } from '@/lib/dayStats';
import { getMonthMatrix, localDateKey, WEEKDAY_LABELS } from '@/lib/dateUtils';
import { computeDayScore, bucketScore } from '@/lib/score';
import { formatMinutes } from '@/lib/format';
import './MonthCalendar.css';

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function MonthCalendar({ stats, onSelectDay }: { stats: StatsSource; onSelectDay: (dateKey: string) => void }) {
  const now = new Date();
  const todayKey = localDateKey(now.getTime());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const cells = getMonthMatrix(year, month);
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const goToPrev = () => {
    const d = new Date(year, month - 1, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };
  const goToNext = () => {
    const d = new Date(year, month + 1, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <div className="month-calendar">
      <div className="month-nav">
        <button onClick={goToPrev}>&larr;</button>
        <strong>{MONTH_LABELS[month]} {year}</strong>
        <button onClick={goToNext}>&rarr;</button>
      </div>

      <div className="month-grid month-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="muted">{label}</span>
        ))}
      </div>

      {weeks.map((week, i) => (
        <div className="month-grid" key={i}>
          {week.map((cell) => {
            const day = getDayTotals(stats, cell.dateKey);
            const score = computeDayScore(day);
            const bucket = bucketScore(score);
            const title = day
              ? `${cell.dateKey}\nGood: ${formatMinutes(day.goodSeconds)}\nBad: ${formatMinutes(day.badSeconds)}\nNeutral: ${formatMinutes(day.neutralSeconds)}`
              : cell.dateKey;

            const selectable = cell.dateKey <= todayKey;

            return (
              <div
                key={cell.dateKey}
                className={`day-cell bucket-${bucket}${cell.inMonth ? '' : ' out-of-month'}${selectable ? ' clickable' : ''}`}
                title={title}
                {...(selectable && {
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => onSelectDay(cell.dateKey),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectDay(cell.dateKey);
                    }
                  },
                })}
              >
                {cell.date.getDate()}
              </div>
            );
          })}
        </div>
      ))}

      <div className="month-legend muted">
        <span><i className="dot bucket-excellent" /> excellent</span>
        <span><i className="dot bucket-good" /> good</span>
        <span><i className="dot bucket-neutral" /> mixed</span>
        <span><i className="dot bucket-poor" /> poor</span>
        <span><i className="dot bucket-bad" /> bad</span>
        <span><i className="dot bucket-none" /> no data</span>
      </div>
    </div>
  );
}
