import { useState } from 'react';
import { useDailyStats } from '@/lib/useDailyStats';
import { getDayHours, getDayTotals } from '@/lib/dayStats';
import { localDateKey } from '@/lib/dateUtils';
import { dayProgress } from '@/lib/score';
import { DEFAULT_DAILY_TARGET_MINUTES, settings } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';
import { useNow } from '@/lib/useNow';
import DashboardHeader from './DashboardHeader';
import ProgressCard from './ProgressCard';
import BreakdownCard from './BreakdownCard';
import HourTimeline from './HourTimeline';
import WeekSummary from './WeekSummary';
import MonthCalendar from './MonthCalendar';
import './Dashboard.css';

export default function DashboardView() {
  const stats = useDailyStats();
  const config = useStorageItem(settings);
  const now = useNow(30_000);
  // null follows today, so the view rolls over at midnight instead of sticking to yesterday.
  const [selected, setSelected] = useState<string | null>(null);

  if (!stats) return null;

  const todayKey = localDateKey(now);
  const key = selected ?? todayKey;
  const isToday = key === todayKey;

  const totals = getDayTotals(stats, key);
  const hours = getDayHours(stats, key);
  const goalSeconds = (config?.dailyGoodTargetMinutes ?? DEFAULT_DAILY_TARGET_MINUTES) * 60;
  const progress = dayProgress(totals, goalSeconds);

  const selectDay = (next: string) => {
    setSelected(next >= todayKey ? null : next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="dashboard">
      <DashboardHeader dateKey={key} isToday={isToday} now={now} onBackToToday={() => setSelected(null)} />

      <div className="dash-top">
        <section className="card">
          <ProgressCard progress={progress} goodSeconds={totals?.goodSeconds ?? 0} goalSeconds={goalSeconds} />
        </section>
        <section className="card">
          <BreakdownCard totals={totals} isToday={isToday} />
        </section>
      </div>

      <section className="card">
        <h2>Hour by hour</h2>
        <HourTimeline hours={hours} hasData={progress !== null} currentHour={isToday ? new Date(now).getHours() : null} />
      </section>

      <div className="dash-bottom">
        <section className="card">
          <h2>Recent week</h2>
          <WeekSummary stats={stats} selectedKey={key} onSelectDay={selectDay} />
        </section>
        <section className="card">
          <h2>Monthly overview</h2>
          <MonthCalendar stats={stats} selectedKey={key} onSelectDay={selectDay} />
        </section>
      </div>
    </div>
  );
}
