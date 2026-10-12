/**
 * Gameplay analytics. Listens to the audio action bus, the decks and the
 * library/career stores and turns what players do into GA4 events.
 *
 * Privacy: nothing identifying about a player's music is sent — no titles,
 * artists, file names or paths. Only the genre tag, tempo, key and length.
 *
 * Events (custom unless noted):
 *   usb_folder_added      deck, folder_access (native|fallback), folder_count  (sent from state/library.ts)
 *   usb_access_restored   deck
 *   library_scanned       deck, track_count, folder_count, size_bucket
 *   track_load            deck, genre, bpm, camelot, length_min        (sent from engine.ts)
 *   track_load_failed     deck, error_type                              (sent from engine.ts)
 *   track_play            deck, genre, bpm, camelot, other_deck_playing, tempo_pct, loads_played
 *   track_finish          deck, genre
 *   feature_used          feature, deck — first use of each control per session
 *   mix_complete          method (manual|sync), rep                     (sent from coach.ts)
 *   mix_trainwreck        —                                             (sent from coach.ts)
 *   tutorial_begin        lesson_id, lesson_name, beginner_mode          (GA4 recommended; career/store.ts)
 *   tutorial_complete     lesson_id, lesson_name, first_time            (GA4 recommended; career/store.ts)
 *   lesson_abandon        lesson_id, lesson_name, step                  (career/store.ts)
 *   level_up              level, character                              (GA4 recommended)
 *   earn_virtual_currency virtual_currency_name=rep, value              (GA4 recommended)
 *   onboarding_choice     beginner_mode
 *   beginner_mode_toggle  enabled
 *   career_reset          rep_lost, lessons_lost
 *   view_change           view (room|booth)                             (sent from App.tsx)
 *   room_3d_unavailable   reason                                        (sent from RoomView.tsx)
 *   session_summary       tracks_loaded, tracks_played, tracks_finished, play_minutes,
 *                         clean_mixes, trainwrecks, features_used, analysis_errors
 *
 * User properties: career_tier, beginner_mode, lessons_completed, folder_access, library_size.
 */

import { engine } from '../audio/engine';
import { onAction, type ActionType } from '../audio/actions';
import { tierFor } from '../career/rules';
import { useCareer } from '../career/store';
import { supportsFolderAccess, useLibrary } from '../state/library';
import type { DeckId } from '../types';
import { setUserProps, track, trackOnExit } from './ga';
import { session, sizeBucket, genreOf } from './session';

const DECKS: DeckId[] = ['A', 'B'];

let started = false;

export function startAnalytics() {
  if (started) return;
  started = true;

  const career = useCareer.getState();
  setUserProps({
    career_tier: tierFor(career.rep).name,
    beginner_mode: career.beginner ? 'on' : 'off',
    lessons_completed: career.completed.length,
    folder_access: supportsFolderAccess ? 'native' : 'fallback',
  });

  // ---- deck transport: plays, finishes and first use of each control ----
  const playedKey: Record<DeckId, string | null> = { A: null, B: null };
  const featuresUsed = new Set<ActionType>();

  onAction(({ type, deck: id }) => {
    if (type === 'play' && id) {
      const deck = engine.decks[id];
      const t = deck.track;
      // one play per track load, not every pause/resume
      if (!t || playedKey[id] === t.key) return;
      playedKey[id] = t.key;
      session.tracksPlayed++;
      track('track_play', {
        deck: id,
        genre: genreOf(t.meta.genre),
        bpm: Math.round(deck.analysis?.bpm ?? 0),
        camelot: deck.analysis?.camelot ?? '',
        other_deck_playing: engine.other(id).playing ? 'yes' : 'no',
        tempo_pct: Math.round((deck.bpm / (deck.analysis?.bpm || deck.bpm || 1) - 1) * 1000) / 10,
        loads_played: session.tracksPlayed,
      });
      return;
    }
    if (type === 'trackEnd' && id) {
      session.tracksFinished++;
      track('track_finish', { deck: id, genre: genreOf(engine.decks[id].track?.meta.genre) });
      return;
    }
    if (!featuresUsed.has(type)) {
      featuresUsed.add(type);
      track('feature_used', { feature: type, deck: id ?? '' });
    }
  });

  // listening time, sampled once a second
  setInterval(() => {
    if (DECKS.some((d) => engine.decks[d].playing)) session.playSeconds++;
  }, 1000);

  // ---- USB / library (folder adds are sent from state/library.ts) ----
  useLibrary.subscribe((s, prev) => {
    for (const id of DECKS) {
      const now = s.slots[id];
      const before = prev.slots[id];
      if (before.status === 'locked' && now.status === 'scanning') track('usb_access_restored', { deck: id });
      if (before.status === 'scanning' && now.status === 'ready') {
        track('library_scanned', {
          deck: id,
          track_count: now.tracks.length,
          folder_count: now.folders.length,
          size_bucket: sizeBucket(now.tracks.length),
        });
        setUserProps({ library_size: sizeBucket(s.slots.A.tracks.length + s.slots.B.tracks.length) });
      }
    }
  });

  // ---- rep, promotions and settings (lesson begin/complete/abandon are sent from the career store) ----
  useCareer.subscribe((s, prev) => {
    if (s.completed.length !== prev.completed.length) setUserProps({ lessons_completed: s.completed.length });

    if (s.rep > prev.rep) track('earn_virtual_currency', { virtual_currency_name: 'rep', value: s.rep - prev.rep });

    const tierNow = tierFor(s.rep);
    if (tierNow.id > tierFor(prev.rep).id) {
      track('level_up', { level: tierNow.id, character: tierNow.name });
      setUserProps({ career_tier: tierNow.name });
    }

    if (s.onboarded && !prev.onboarded) {
      track('onboarding_choice', { beginner_mode: s.beginner ? 'on' : 'off' });
    } else if (s.beginner !== prev.beginner) {
      track('beginner_mode_toggle', { enabled: s.beginner ? 'on' : 'off' });
    }
    if (s.beginner !== prev.beginner) setUserProps({ beginner_mode: s.beginner ? 'on' : 'off' });

    if (s.rep === 0 && prev.rep > 0 && s.completed.length === 0) {
      track('career_reset', { rep_lost: prev.rep, lessons_lost: prev.completed.length });
      setUserProps({ career_tier: tierFor(0).name, lessons_completed: 0 });
    }
  });

  // ---- session summary, sent whenever the tab is hidden or closed ----
  let lastSent = '';
  const summary = () => {
    const all = [...useLibrary.getState().slots.A.tracks, ...useLibrary.getState().slots.B.tracks];
    const params = {
      tracks_loaded: session.tracksLoaded,
      tracks_played: session.tracksPlayed,
      tracks_finished: session.tracksFinished,
      play_minutes: Math.round(session.playSeconds / 6) / 10,
      clean_mixes: session.cleanMixes,
      trainwrecks: session.trainwrecks,
      features_used: featuresUsed.size,
      analysis_errors: all.filter((t) => t.analysisState === 'error').length,
    };
    const key = JSON.stringify(params);
    if (key === lastSent || (!session.tracksLoaded && !session.playSeconds)) return;
    lastSent = key;
    trackOnExit('session_summary', params);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') summary();
  });
  window.addEventListener('pagehide', summary);
}
