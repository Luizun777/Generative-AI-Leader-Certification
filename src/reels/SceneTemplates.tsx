import type { CSSProperties, ReactNode } from 'react';
import type { Scene } from '../lib/reels';

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;

interface LayerProps { at?: number; dx?: number; dy?: number; spin?: number; rot?: number; amp?: number; className?: string; decorative?: boolean; children?: ReactNode }
// A cut-out that drops into place over four frames starting at frame `at`.
function Layer({ at = 0, dx, dy, spin, rot, amp, className = '', decorative = false, children }: LayerProps) {
  const style = { '--at': at, ...(dx !== undefined && { '--dx': dx }), ...(dy !== undefined && { '--dy': dy }), ...(spin !== undefined && { '--spin': spin }), ...(rot !== undefined && { '--rot': `${rot}deg` }), ...(amp !== undefined && { '--amp': amp }) } as CSSProperties;
  return <div className={`reel-layer ${className}`} style={style} aria-hidden={decorative || undefined}>{children}</div>;
}
function Art({ id, at, rot, small = false }: { id: string; at: number; rot: number; small?: boolean }) {
  return <Layer at={at} rot={rot} dy={5} amp={.7} className={`reel-art-wrap ${small ? 'small' : ''}`}><div className="reel-art"><img src={asset(`reels/${id}.avif`)} alt="" draggable={false} onError={event => { event.currentTarget.hidden = true; }}/></div><span className="reel-tape"/></Layer>;
}
function Scraps() {
  return <><Layer at={0} dy={-5} spin={3} amp={1.8} className="reel-scrap s1"/><Layer at={2} dx={-5} dy={0} amp={1.5} className="reel-scrap s2"/></>;
}

// Visible text is decorative for assistive tech: the player announces each scene through its live region.
export function SceneView({ scene, unitId, actions }: { scene: Scene; unitId: string; actions?: ReactNode }) {
  const props = { className: `reel-scene kind-${scene.kind}`, 'data-accent': scene.accent ?? 'blue' };
  switch (scene.kind) {
    case 'hook': return <div {...props} aria-hidden="true"><Scraps/>
      <Layer at={4} rot={-3} className="reel-chip">UNIDAD {unitId}</Layer>
      <div className="reel-title">{scene.title.split(' ').map((word, index) => <Layer key={index} at={8 + index * 3} rot={index % 2 ? 1.5 : -1.5} className="reel-word">{word}</Layer>)}</div>
      <Layer at={22} rot={1} dx={-3} dy={0} className="reel-strip">{scene.line}</Layer>
      <Layer at={28} dx={6} dy={2} spin={4} amp={.5} className="reel-fox"><img src={asset('art/fox-calm.png')} alt="" draggable={false}/></Layer>
    </div>;
    case 'concept': return <div {...props} aria-hidden="true"><Scraps/>
      <Art id={scene.art} at={1} rot={-2}/>
      {scene.lines.map((line, index) => <Layer key={index} at={9 + index * 7} rot={index % 2 ? .8 : -.8} dx={index % 2 ? 3 : -3} dy={1} className="reel-strip">{line}</Layer>)}
    </div>;
    case 'versus': return <div {...props} aria-hidden="true"><Scraps/>
      <Layer at={1} rot={-2} className="reel-chip">NO LAS CONFUNDAS</Layer>
      <Layer at={6} dx={-6} dy={0} rot={-1.5} className="reel-card a"><strong>{scene.a.term}</strong><span>{scene.a.line}</span></Layer>
      <Layer at={16} dy={0} spin={-14} className="reel-badge">≠</Layer>
      <Layer at={20} dx={6} dy={0} rot={1.5} className="reel-card b"><strong>{scene.b.term}</strong><span>{scene.b.line}</span></Layer>
    </div>;
    case 'list': return <div {...props} aria-hidden="true"><Scraps/>
      <Layer at={1} className="reel-heading">{scene.title}</Layer>
      {scene.points.map((point, index) => <Layer key={index} at={10 + index * 14} dx={index % 2 ? 4 : -4} dy={1} rot={index % 2 ? .7 : -.7} className="reel-strip reel-point"><span className="reel-num">{index + 1}</span>{point}</Layer>)}
    </div>;
    case 'example': return <div {...props} aria-hidden="true"><Scraps/>
      <Layer at={1} rot={2} className="reel-chip">POR EJEMPLO</Layer>
      {scene.art && <Art id={scene.art} at={4} rot={2} small/>}
      <Layer at={12} rot={-1.5} className="reel-note">{scene.lines.join(' ')}</Layer>
    </div>;
    case 'cta': return <div {...props}><div aria-hidden="true" className="reel-decor"><Scraps/></div>
      <Layer at={1} dy={6} spin={-3} amp={.5} decorative className="reel-fox-big"><img src={asset('art/fox-celebrate.png')} alt="" draggable={false}/></Layer>
      <Layer at={8} decorative className="reel-heading center">{scene.line}</Layer>
      {actions && <Layer at={16} dy={2} spin={0} amp={0} className="reel-actions">{actions}</Layer>}
    </div>;
  }
}
