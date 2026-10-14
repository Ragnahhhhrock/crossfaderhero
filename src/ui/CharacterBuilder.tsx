import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { characterLook } from '../character/avatar';
import {
  BODIES, CLOTH_COLOURS, EARRING_STYLES, EARRINGS, FACIAL_HAIR, GENDERS, HAIR_COLOURS, HAIR_STYLES, HATS, HEIGHT, INK_COLOURS,
  METALS, NAME_MAX, PANTS, SHOES, SKIN_TONES, TATTOOS, TOPS, defaultCharacter, randomCharacter, suggestName,
  type Character, type Swatch,
} from '../character/options';
import { Figures } from '../club/people';
import { hex } from '../design/tokens';
import { useCharacter } from '../state/character';

/** Your DJ, turning slowly on a little stage. Drag to spin them round. */
function Preview({ character }: { character: Character }) {
  const host = useRef<HTMLDivElement>(null);
  const fig = useRef<Figures | null>(null);
  const spin = useRef({ yaw: 0.35, drag: null as number | null, idle: 0 });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 1.08, 4.35);
    camera.lookAt(0, 1.02, 0);
    scene.add(new THREE.HemisphereLight(hex('ink-100'), hex('graphite-800'), 1.6));
    const key = new THREE.DirectionalLight(hex('ink-100'), 2.2);
    key.position.set(2, 3, 4);
    const rim = new THREE.DirectionalLight(hex('deck-a'), 1.6);
    rim.position.set(-3, 2, -3);
    const rim2 = new THREE.DirectionalLight(hex('deck-b'), 1.2);
    rim2.position.set(3, 1.5, -3);
    scene.add(key, rim, rim2);
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.8, 0.04, 48),
      new THREE.MeshStandardMaterial({ color: hex('graphite-600'), roughness: 0.6 }),
    );
    floor.position.y = -0.02;
    scene.add(floor);
    const f = new Figures([{ x: 0, y: 0, z: 0, yaw: 0, scale: 1, style: 'bounce', phase: 0, r: 0.2 }], 7);
    scene.add(f.group);
    fig.current = f;

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      const s = spin.current;
      if (s.drag === null && !calm) {
        s.idle += dt;
        if (s.idle > 2) s.yaw += dt * 0.35;
      }
      f.people[0].yaw = s.yaw;
      f.update((t * 118) / 60, calm ? 0.2 : 0.75, t, 118);
      renderer.render(scene, camera);
    });
    return () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
      fig.current = null;
    };
  }, []);

  useEffect(() => {
    const f = fig.current;
    if (!f) return;
    const { look, outfit, scale } = characterLook(character);
    f.restyle(0, look, outfit);
    f.people[0].scale = scale;
  }, [character, failed]);

  if (failed) return <div className="cb-preview cb-preview-off">3D preview needs WebGL</div>;
  return (
    <div
      className="cb-preview"
      ref={host}
      aria-label="Preview of your DJ. Drag to turn them around."
      onPointerDown={(e) => {
        spin.current.drag = e.clientX;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s = spin.current;
        if (s.drag === null) return;
        s.yaw += (e.clientX - s.drag) * 0.012;
        s.drag = e.clientX;
        s.idle = 0;
      }}
      onPointerUp={() => (spin.current.drag = null)}
      onPointerCancel={() => (spin.current.drag = null)}
    />
  );
}

function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="cb-field">
      <span className="cb-label">{label}</span>
      <div className="cb-choices" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={value === o.id} className={`cb-chip ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, options, value, onChange }: { label: string; options: Swatch[]; value: string; onChange: (v: string) => void }) {
  const current = options.find((o) => o.token === value);
  return (
    <div className="cb-field">
      <span className="cb-label">
        {label} <span className="cb-value">{current?.label}</span>
      </span>
      <div className="cb-swatches" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.token}
            role="radio"
            aria-checked={value === o.token}
            aria-label={o.label}
            title={o.label}
            className={`cb-swatch ${value === o.token ? 'on' : ''}`}
            style={{ background: `var(--${o.token})` }}
            onClick={() => onChange(o.token)}
          />
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} className={`cb-chip ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      {label}
    </button>
  );
}

type Tab = 'you' | 'hair' | 'ink' | 'clothes';
const TABS: { id: Tab; label: string }[] = [
  { id: 'you', label: 'Body' },
  { id: 'hair', label: 'Hair & face' },
  { id: 'ink', label: 'Jewellery & ink' },
  { id: 'clothes', label: 'Clothes' },
];

/** Build your DJ: on first start, and later from your name in the top bar. */
export function CharacterBuilder({ onClose }: { onClose?: () => void }) {
  const saved = useCharacter((s) => s.character);
  const save = useCharacter((s) => s.save);
  const first = saved === null;
  const [c, setC] = useState<Character>(() => saved ?? { ...randomCharacter(), djName: '' });
  const [tab, setTab] = useState<Tab>('you');
  const set = <K extends keyof Character>(k: K, v: Character[K]) => setC((o) => ({ ...o, [k]: v }));
  const name = c.djName.trim();

  useEffect(() => {
    if (first || !onClose) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [first, onClose]);

  const done = () => {
    if (!name) return;
    save(c);
    onClose?.();
  };

  return (
    <div className="modal-backdrop" onClick={first ? undefined : onClose}>
      <div className="modal char-builder" role="dialog" aria-modal="true" aria-labelledby="cb-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="cb-title">{first ? 'Create your DJ' : 'Edit your DJ'}</h2>
        <div className="cb-body">
          <div className="cb-stage">
            <Preview character={c} />
            <div className="cb-bill">
              <strong>{name || 'Your DJ name'}</strong>
              <span>{c.height} cm</span>
            </div>
          </div>

          <div className="cb-panel">
            <div className="cb-field">
              <label className="cb-label" htmlFor="cb-name">DJ name</label>
              <div className="cb-name">
                <input
                  id="cb-name"
                  value={c.djName}
                  maxLength={NAME_MAX}
                  placeholder="What goes on the flyer?"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => set('djName', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && done()}
                />
                <button className="tiny" onClick={() => set('djName', suggestName())}>Suggest</button>
              </div>
            </div>

            <div className="cb-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={`cb-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="cb-tabpanel" role="tabpanel">
              {tab === 'you' && (
                <>
                  <Choice label="Gender" options={GENDERS} value={c.gender} onChange={(v) => set('gender', v)} />
                  <div className="cb-field">
                    <label className="cb-label" htmlFor="cb-height">
                      Height <span className="cb-value">{c.height} cm</span>
                    </label>
                    <input id="cb-height" type="range" min={HEIGHT.min} max={HEIGHT.max} value={c.height} onChange={(e) => set('height', Number(e.target.value))} />
                  </div>
                  <Choice label="Body type" options={BODIES} value={c.body} onChange={(v) => set('body', v)} />
                  <Swatches label="Skin tone" options={SKIN_TONES} value={c.skin} onChange={(v) => set('skin', v)} />
                </>
              )}
              {tab === 'hair' && (
                <>
                  <Choice label="Hair style" options={HAIR_STYLES} value={c.hairStyle} onChange={(v) => set('hairStyle', v)} />
                  <Swatches label="Hair colour" options={HAIR_COLOURS} value={c.hairColour} onChange={(v) => set('hairColour', v)} />
                  <Choice label="Facial hair" options={FACIAL_HAIR} value={c.facialHair} onChange={(v) => set('facialHair', v)} />
                </>
              )}
              {tab === 'ink' && (
                <>
                  <Choice label="Earrings" options={EARRINGS} value={c.earrings} onChange={(v) => set('earrings', v)} />
                  {c.earrings !== 'none' && <Choice label="Earring style" options={EARRING_STYLES} value={c.earringStyle} onChange={(v) => set('earringStyle', v)} />}
                  <div className="cb-field">
                    <span className="cb-label">Piercings</span>
                    <div className="cb-choices">
                      <Toggle label="Nose" on={c.piercings.nose} onChange={(v) => set('piercings', { ...c.piercings, nose: v })} />
                      <Toggle label="Eyebrow" on={c.piercings.eyebrow} onChange={(v) => set('piercings', { ...c.piercings, eyebrow: v })} />
                      <Toggle label="Lip" on={c.piercings.lip} onChange={(v) => set('piercings', { ...c.piercings, lip: v })} />
                    </div>
                  </div>
                  <Choice label="Metal" options={METALS} value={c.metal} onChange={(v) => set('metal', v)} />
                  <Choice label="Tattoo, left arm" options={TATTOOS} value={c.tattoos.left} onChange={(v) => set('tattoos', { ...c.tattoos, left: v })} />
                  <Choice label="Tattoo, right arm" options={TATTOOS} value={c.tattoos.right} onChange={(v) => set('tattoos', { ...c.tattoos, right: v })} />
                  {(c.tattoos.left !== 'none' || c.tattoos.right !== 'none') && <Swatches label="Ink" options={INK_COLOURS} value={c.ink} onChange={(v) => set('ink', v)} />}
                  {(c.tattoos.left !== 'none' || c.tattoos.right !== 'none') && (c.top === 'longsleeve' || c.top === 'hoodie') && <p className="cb-note">Your {c.top === 'hoodie' ? 'hoodie' : 'long sleeves'} cover your tattoos. Pick a T-shirt or tank top to show them off.</p>}
                </>
              )}
              {tab === 'clothes' && (
                <>
                  <Choice label="Top" options={TOPS} value={c.top} onChange={(v) => set('top', v)} />
                  <Swatches label="Top colour" options={CLOTH_COLOURS} value={c.topColour} onChange={(v) => set('topColour', v)} />
                  <Choice label="Pants" options={PANTS} value={c.pants} onChange={(v) => set('pants', v)} />
                  <Swatches label="Pants colour" options={CLOTH_COLOURS} value={c.pantsColour} onChange={(v) => set('pantsColour', v)} />
                  <Choice label="Shoes" options={SHOES} value={c.shoes} onChange={(v) => set('shoes', v)} />
                  <Swatches label="Shoe colour" options={CLOTH_COLOURS} value={c.shoesColour} onChange={(v) => set('shoesColour', v)} />
                  <Choice label="Hat" options={HATS} value={c.hat} onChange={(v) => set('hat', v)} />
                  {c.hat !== 'none' && <Swatches label="Hat colour" options={CLOTH_COLOURS} value={c.hatColour} onChange={(v) => set('hatColour', v)} />}
                  <div className="cb-field">
                    <span className="cb-label">Extras</span>
                    <div className="cb-choices">
                      <Toggle label="Sunglasses" on={c.shades} onChange={(v) => set('shades', v)} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="welcome-actions cb-actions">
          <button className="tiny" onClick={() => setC((o) => randomCharacter(Math.random, o.djName))}>Randomise</button>
          <button className="tiny" onClick={() => setC((o) => ({ ...defaultCharacter(), djName: o.djName }))}>Reset</button>
          <span className="cb-spacer" />
          {!name && <span className="cb-hint">Give your DJ a name to continue</span>}
          {!first && <button className="tiny" onClick={onClose}>Cancel</button>}
          <button className="primary" disabled={!name} onClick={done}>
            {first ? 'Start my career' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
