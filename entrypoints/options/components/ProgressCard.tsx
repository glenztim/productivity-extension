import { formatMinutes } from '@/lib/format';
import { PROGRESS_LABELS, progressLevel } from '@/lib/score';

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface Props {
  /** Good time over the daily goal; null when nothing was tracked. May exceed 1. */
  progress: number | null;
  goodSeconds: number;
  goalSeconds: number;
}

export default function ProgressCard({ progress, goodSeconds, goalSeconds }: Props) {
  const level = progressLevel(progress);
  const percent = Math.round((progress ?? 0) * 100);
  // The ring stops at one full lap; the percentage keeps counting past 100%.
  const filled = Math.min(1, progress ?? 0);

  return (
    <div className="progress-card">
      <div className="day-ring" role="img" aria-label={`${percent}% of the daily good-time goal`}>
        <svg viewBox="0 0 120 120">
          <circle className="ring-track" cx="60" cy="60" r={RING_RADIUS} />
          {filled > 0 && (
            <circle
              className="ring-fill"
              cx="60"
              cy="60"
              r={RING_RADIUS}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - filled)}
              transform="rotate(-90 60 60)"
            />
          )}
        </svg>
        <div className="ring-label">
          <strong className="ring-percent">{percent}%</strong>
          <span className="muted">
            {formatMinutes(goodSeconds)} of {formatMinutes(goalSeconds)}
          </span>
        </div>
      </div>
      <p className={`level-label${level === 'none' ? ' muted' : ''}`}>
        {level === 'none' ? 'No data yet' : PROGRESS_LABELS[level]}
      </p>
    </div>
  );
}
