import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEK = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

export function CalendarWidget({ size, preview }: { size: 'S' | 'M' | 'L'; preview?: boolean }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const today = new Date();
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: { day: number | null; isToday: boolean }[] = [];
    for (let i = 0; i < firstDow; i++) out.push({ day: null, isToday: false });
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({
        day: d,
        isToday:
          d === today.getDate() && month === today.getMonth() && year === today.getFullYear(),
      });
    }
    return out;
  }, [cursor, today]);

  const title = cursor.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  const compact = size === 'S';

  return (
    <div className={`hw-cal hw-size-${size}`}>
      <div className="hw-cal-nav">
        <span className="hw-cal-month">{title}</span>
        {!preview && (
          <>
            <button
              type="button"
              className="hw-icon-btn"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="hw-icon-btn"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight size={14} />
            </button>
          </>
        )}
      </div>
      <div className={`hw-cal-grid ${compact ? 'compact' : ''}`}>
        {WEEK.map((d) => (
          <span key={d} className="hw-cal-dow">
            {compact ? d[0] : d}
          </span>
        ))}
        {cells.map((c, i) => (
          <span
            key={i}
            className={`hw-cal-day ${c.isToday ? 'today' : ''} ${c.day ? '' : 'empty'}`}
          >
            {c.day ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}
