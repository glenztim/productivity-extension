import { userName } from '@/lib/storage';
import { useStorageItem } from '@/lib/useStorageItem';
import { parseDateKey } from '@/lib/dateUtils';

function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface Props {
  dateKey: string;
  isToday: boolean;
  now: number;
  onBackToToday: () => void;
}

export default function DashboardHeader({ dateKey, isToday, now, onBackToToday }: Props) {
  const name = useStorageItem(userName)?.trim();
  const date = parseDateKey(dateKey);

  const title = isToday
    ? `${greeting(new Date(now).getHours())}${name ? `, ${name}` : ''}`
    : `${date.toLocaleDateString(undefined, { weekday: 'long' })} recapped`;

  return (
    <header className="dash-header">
      <h2 className="dash-greeting">{title}</h2>
      <p className="dash-date">
        {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        {!isToday && (
          <button className="link" onClick={onBackToToday}>
            Back to today
          </button>
        )}
      </p>
    </header>
  );
}
