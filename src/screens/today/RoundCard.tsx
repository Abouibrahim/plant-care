// "Today's round": tasks done today against today's total as a ring, a line that changes as the
// round goes, and the check-in streak. The sage card under the Today header.
import { Check, Flame, Leaf, Sparkles } from "lucide-react";
import { t } from "../../i18n";
import { daysBetween } from "../../lib/dates";

const R = 30;
const CIRCUMFERENCE = 2 * Math.PI * R;

function Ring({ done, total }: { done: number; total: number }) {
  const allDone = total > 0 && done >= total;
  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className={`ring ${allDone ? "full" : ""}`} role="img" aria-label={t.today.roundProgress(done, total)}>
      <svg viewBox="0 0 72 72" width={72} height={72} aria-hidden>
        <circle className="ring-track" cx={36} cy={36} r={R} />
        <circle
          className="ring-fill"
          cx={36}
          cy={36}
          r={R}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <span className="ring-label" aria-hidden>
        {allDone ? <Check size={28} strokeWidth={3} /> : total === 0 ? <Leaf size={26} /> : `${done}/${total}`}
      </span>
    </div>
  );
}

interface Props {
  /** Tasks marked done today. */
  done: number;
  /** done plus the pending tasks due today or overdue. */
  total: number;
  /** Consecutive days Today was opened, today included. */
  streak: number;
  /** YYYY-MM-DD; picks the day's encouragement. */
  today: string;
}

export function RoundCard({ done, total, streak, today }: Props) {
  const nothing = total === 0;
  const allDone = !nothing && done >= total;
  const cheers = t.today.roundCheers;
  const cheer = cheers[Math.abs(daysBetween(`${today.slice(0, 4)}-01-01`, today)) % cheers.length];
  const title = nothing ? t.today.roundNothing : allDone ? t.today.roundAllDone : t.today.roundProgress(done, total);
  const body = nothing ? t.today.roundNothingBody : allDone ? t.today.roundAllDoneBody : `${t.today.roundLeft(total - done)} ${cheer}`;

  return (
    <section className={`round-card ${allDone ? "all-done" : ""}`} aria-live="polite">
      <Ring done={done} total={total} />
      <div className="grow">
        <div className="eyebrow">
          <Sparkles size={14} aria-hidden />
          {t.today.round}
        </div>
        <h2>{title}</h2>
        <p>{body}</p>
        {streak >= 2 && (
          <span className="streak" title={t.today.streakHint}>
            <Flame size={16} aria-hidden />
            {t.today.streak(streak)}
          </span>
        )}
      </div>
    </section>
  );
}
