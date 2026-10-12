import { useEffect, useState } from 'react';
import { useCoach } from '../career/coach';
import { isUnlocked, lessonById, LESSONS, nextLesson } from '../career/lessons';
import { nextTier, tierFor, TIERS } from '../career/rules';
import { useCareer } from '../career/store';

/** Tier and rep in the top bar; opens the lessons. */
export function CareerChip({ onOpen }: { onOpen: () => void }) {
  const rep = useCareer((s) => s.rep);
  const tier = tierFor(rep);
  const next = nextTier(rep);
  const pct = next ? ((rep - tier.rep) / (next.rep - tier.rep)) * 100 : 100;
  return (
    <button className="career-chip" onClick={onOpen} title={next ? `${next.rep - rep} rep to ${next.name}` : 'Top of the bill'}>
      <span className="career-tier">{tier.name}</span>
      <span className="career-rep">{rep} rep</span>
      <span className="career-bar" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="career-open">Lessons</span>
    </button>
  );
}

/** "New to DJing?" on the very first visit. */
export function Welcome() {
  const onboarded = useCareer((s) => s.onboarded);
  const finish = useCareer((s) => s.finishOnboarding);
  const start = useCareer((s) => s.start);
  if (onboarded) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <h2 id="welcome-title">Welcome to Crossfader Hero</h2>
        <p>
          You start in your bedroom with two decks and a mixer. Learn the craft, earn rep with clean mixes, and work your way
          from house parties to the festival main stage. Advanced lessons — scratching, beat juggling and more — unlock as your
          career grows.
        </p>
        <p><strong>New to DJing?</strong> Beginner mode walks you through the fundamentals step by step, checking your work on the decks as you go.</p>
        <div className="welcome-actions">
          <button
            className="primary"
            autoFocus
            onClick={() => {
              finish(true);
              start('gear');
            }}
          >
            Yes — start Beginner mode
          </button>
          <button className="tiny" onClick={() => finish(false)}>
            I know my way around
          </button>
        </div>
      </div>
    </div>
  );
}

/** All lessons, grouped by career tier, with locks. */
export function LessonsModal({ onClose }: { onClose: () => void }) {
  const { rep, completed, beginner, active, mixes } = useCareer();
  const { setBeginner, start, reset } = useCareer.getState();
  const tier = tierFor(rep);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal lessons" role="dialog" aria-modal="true" aria-labelledby="lessons-title" onClick={(e) => e.stopPropagation()}>
        <div className="lessons-head">
          <h2 id="lessons-title">Lessons</h2>
          <label className="switch">
            <input type="checkbox" checked={beginner} onChange={(e) => setBeginner(e.target.checked)} />
            <span>Beginner mode</span>
          </label>
        </div>
        <p className="lessons-status">
          {tier.name} · {rep} rep · {completed.length}/{LESSONS.length} lessons · {mixes} clean {mixes === 1 ? 'mix' : 'mixes'}
          {nextTier(rep) && <> · {nextTier(rep)!.rep - rep} rep to {nextTier(rep)!.name}</>}
        </p>
        <p className="note">Earn rep by finishing lessons and by clean practice mixes (+20 by hand, +8 with Sync). Each promotion unlocks new lessons.</p>

        {TIERS.map((t) => {
          const lessons = LESSONS.filter((l) => l.tier === t.id);
          const locked = t.id > tier.id;
          return (
            <section key={t.id} className={`lesson-tier ${locked ? 'locked' : ''}`}>
              <h3>
                {t.id === 0 ? 'Fundamentals' : t.name}
                {locked && <span className="lock">Unlocks at {t.rep} rep</span>}
              </h3>
              <ul>
                {lessons.map((l) => {
                  const done = completed.includes(l.id);
                  const open = isUnlocked(l, tier.id);
                  return (
                    <li key={l.id} className={done ? 'done' : ''}>
                      <span className="lesson-mark" aria-hidden>{done ? '✓' : open ? '•' : '🔒'}</span>
                      <div className="lesson-text">
                        <strong>{l.title}</strong>
                        <span>{l.summary}</span>
                      </div>
                      <span className="lesson-rep">+{l.rep}</span>
                      <button
                        className={`tiny ${active === l.id ? 'on' : ''}`}
                        disabled={!open}
                        onClick={() => {
                          start(l.id);
                          onClose();
                        }}
                      >
                        {active === l.id ? 'In progress' : done ? 'Replay' : 'Start'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <div className="lessons-foot">
          {confirmReset ? (
            <>
              <span>Wipe rep and lessons?</span>
              <button className="tiny warn" onClick={() => (reset(), setConfirmReset(false))}>Yes, start over</button>
              <button className="tiny" onClick={() => setConfirmReset(false)}>Keep it</button>
            </>
          ) : (
            <button className="tiny" onClick={() => setConfirmReset(true)}>Reset career</button>
          )}
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/** The step-by-step coach card shown while a lesson runs. */
export function Coach({ onOpenLessons }: { onOpenLessons: () => void }) {
  const { active, step, completed, rep, beginner } = useCareer();
  const { start, stop } = useCareer.getState();
  const progress = useCoach((s) => s.progress);
  const finished = useCoach((s) => s.finished);
  const dismiss = useCoach((s) => s.dismissFinished);
  const [collapsed, setCollapsed] = useState(false);
  const tier = tierFor(rep).id;
  const upNext = nextLesson(completed, tier);

  if (finished && !active) {
    const l = lessonById(finished)!;
    return (
      <aside className="coach" aria-live="polite">
        <div className="coach-kicker">Lesson complete</div>
        <h3>{l.title}</h3>
        {upNext ? (
          <p>Next up: <strong>{upNext.title}</strong> — {upNext.summary}</p>
        ) : (
          <p>You've done every lesson open to you. Earn rep with clean mixes to unlock more.</p>
        )}
        <div className="coach-actions">
          {upNext && (
            <button className="primary" onClick={() => (dismiss(), start(upNext.id))}>
              Start next lesson
            </button>
          )}
          <button className="tiny" onClick={dismiss}>Free practice</button>
        </div>
      </aside>
    );
  }

  if (!active) {
    if (!beginner || !upNext) return null;
    return (
      <aside className="coach coach-mini">
        <div className="coach-kicker">Beginner mode · next lesson</div>
        <strong>{upNext.title}</strong>
        <div className="coach-actions">
          <button className="tiny on" onClick={() => start(upNext.id)}>Start</button>
          <button className="tiny" onClick={onOpenLessons}>All lessons</button>
        </div>
      </aside>
    );
  }

  const lesson = lessonById(active)!;
  const s = lesson.steps[step];
  return (
    <aside className={`coach ${collapsed ? 'collapsed' : ''}`} aria-live="polite">
      <div className="coach-top">
        <div className="coach-kicker">
          {lesson.title} · step {step + 1} of {lesson.steps.length}
        </div>
        <button className="tiny" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>
      <h3>{s.title}</h3>
      {!collapsed && (
        <>
          <p>{s.text}</p>
          {s.tip && <p className="coach-tip">Tip: {s.tip}</p>}
          <div className="coach-steps" aria-hidden>
            {lesson.steps.map((_, i) => (
              <i key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />
            ))}
          </div>
          {s.hold ? (
            <div className="coach-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <i style={{ width: `${progress * 100}%` }} />
            </div>
          ) : null}
          <div className="coach-actions">
            <button className="tiny" onClick={stop}>Quit lesson</button>
          </div>
        </>
      )}
    </aside>
  );
}
