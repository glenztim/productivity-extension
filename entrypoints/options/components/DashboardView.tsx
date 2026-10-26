import { useState } from 'react';
import { useDailyStats } from '@/lib/useDailyStats';
import DayView from './DayView';
import WeekSummary from './WeekSummary';
import MonthCalendar from './MonthCalendar';

type DashboardTab = 'today' | 'overview';

export default function DashboardView() {
  const stats = useDailyStats();
  const [tab, setTab] = useState<DashboardTab>('today');
  // null follows today, so the view rolls over at midnight instead of sticking to yesterday.
  const [dateKey, setDateKey] = useState<string | null>(null);

  if (!stats) return null;

  const openDay = (key: string) => {
    setDateKey(key);
    setTab('today');
  };

  return (
    <>
      <nav className="sub-tabs">
        <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>Today</button>
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button>
      </nav>

      {tab === 'today' ? (
        <section className="card">
          <DayView stats={stats} dateKey={dateKey} onChange={setDateKey} />
        </section>
      ) : (
        <>
          <section className="card">
            <h2>Recent week</h2>
            <WeekSummary stats={stats} onSelectDay={openDay} />
          </section>
          <section className="card">
            <h2>Monthly overview</h2>
            <MonthCalendar stats={stats} onSelectDay={openDay} />
          </section>
        </>
      )}
    </>
  );
}
