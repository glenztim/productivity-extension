import { useState } from 'react';
import { getDayTotals, type StatsSource } from '@/lib/dayStats';
import { getMonthMatrix, localDateKey, WEEKDAY_LABELS } from '@/lib/dateUtils';
import { dayProgress, progressLevel, PROGRESS_LABELS } from '@/lib/score';
import { formatMinutes } from '@/lib/format';
import { DEFAULT_DAILY_TARGET_MINUTES, settings } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';
import './MonthCalendar.css';

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function MonthCalendar({
  stats,
  selectedKey,
  onSelectDay,
}: {
  stats: StatsSource;
  selectedKey: string;
  onSelectDay: (dateKey: string) => void;
}) {
  const config = useStorageItem(settings);
  const goalSeconds = (config?.dailyGoodTargetMinutes ?? DEFAULT_DAILY_TARGET_MINUTES) * 60;
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
            const progress = dayProgress(day, goalSeconds);
            const level = progressLevel(progress);
            const title =
              day && progress !== null
                ? `${cell.dateKey}
${Math.round(progress * 100)}% of goal
Good: ${formatMinutes(day.goodSeconds)}
Neutral: ${formatMinutes(day.neutralSeconds)}
Bad: ${formatMinutes(day.badSeconds)}`
                : cell.dateKey;

            const selectable = cell.dateKey <= todayKey;

            return (
              <div
                key={cell.dateKey}
                className={`day-cell bucket-${level}${cell.inMonth ? '' : ' out-of-month'}${selectable ? ' clickable' : ''}${cell.dateKey === selectedKey ? ' selected' : ''}`}
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
        {(Object.keys(PROGRESS_LABELS) as Array<keyof typeof PROGRESS_LABELS>).map((l) => (
          <span key={l}><i className={`dot bucket-${l}`} /> {PROGRESS_LABELS[l].toLowerCase()}</span>
        ))}
        <span><i className="dot bucket-none" /> no data</span>
      </div>
    </div>
  );
}
