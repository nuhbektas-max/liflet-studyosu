import { useRef } from 'react';
import type { Project, Slot, SlotContent } from '../model/types';
import { duzenle, type Olcer } from './duzen';
import { kapla } from './foto';
import { fotoMod, fotoMu, fotoYerlesim, golgeKatmanlari, metinKutusu } from './gorunum';
import { stilBul } from './stil';
import type { Bulgu } from './kontrol';

export const MM_PX = 3; // 1 mm = 3 birim (zoom 1)

export const TUR_SIMGE: Record<string, string> = { metin: '¶', baslik: 'T', foto: '▣', logo: '◈', tablo: '▦', iletisim: '✉' };

type AlanProps = {
  a: Slot; c?: SlotContent; olc: Olcer | null; onek: string; zoom: number;
  secili?: boolean; sorun?: string; etkilesim?: boolean;
  sec?: () => void; baslatSurukle?: (e: React.PointerEvent) => void;
};

function AlanCiz({ a, c, olc, onek, zoom, secili, sorun, etkilesim, sec, baslatSurukle }: AlanProps) {
  const r = a.rect; const foto = fotoMu(a, c);
  const id = `${onek}-kirp-${a.id}`;
  let ic: React.ReactNode = null;
  if (foto && c?.foto && c.fotoBoyut) {
    const k = fotoYerlesim(a, c)!;
    ic = <><clipPath id={id}><rect x={r.x} y={r.y} width={r.w} height={r.h} /></clipPath>
      <image href={c.foto} x={k.x} y={k.y} width={k.w} height={k.h} preserveAspectRatio="none" clipPath={`url(#${id})`}
        style={etkilesim ? { cursor: 'grab' } : undefined} onPointerDown={etkilesim ? (e) => { sec?.(); baslatSurukle?.(e); } : undefined} /></>;
  } else if (!foto && c?.metin && olc) {
    const st = stilBul(a, c); const d = duzenle(c.metin, st, metinKutusu(r, c), olc);
    const fs = (st.punto * 25.4) / 72;
    ic = d.parcalar.map((q, i) => (<g key={i}>
      {c.yaziGolge && <text x={q.x + c.yaziGolge.dx} y={q.y + c.yaziGolge.dy} fontSize={fs} fontFamily={`'Liflet ${st.aile}'`} fontWeight={st.kalin ? 700 : 400} fill={c.yaziGolge.renk} fillOpacity={c.yaziGolge.opaklik} style={{ userSelect: 'none' }}>{q.t}</text>}
      <text x={q.x} y={q.y} fontSize={fs} fontFamily={`'Liflet ${st.aile}'`} fontWeight={st.kalin ? 700 : 400} fill={c.yaziRenk ?? '#1a1a1a'} style={{ userSelect: 'none' }}>{q.t}</text></g>));
  }
  const bos = !ic && !c?.zemin;
  // Boş alan etiketi, ekranda en az ~12 px okunacak büyüklükte.
  const etiketBoy = Math.min(Math.max(3, 12 / (MM_PX * zoom)), r.h * 0.45, r.w / 6);
  return (
    <g onClick={etkilesim ? sec : undefined} style={etkilesim ? { cursor: 'pointer' } : undefined} className={etkilesim ? 'alan-grubu' : undefined}>
      {c?.golge && golgeKatmanlari(r, c.golge).map((k, i) => <rect key={i} x={k.rect.x} y={k.rect.y} width={k.rect.w} height={k.rect.h} fill={c.golge!.renk} fillOpacity={k.opaklik} />)}
      {c?.zemin && <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={c.zemin.renk} fillOpacity={c.zemin.opaklik} />}
      <rect className="alan-kutu" x={r.x} y={r.y} width={r.w} height={r.h} fill={bos && etkilesim ? 'rgba(21,101,192,.06)' : 'transparent'} pointerEvents={etkilesim ? 'all' : 'none'}
        stroke={sorun ? '#d32f2f' : secili ? '#1565c0' : c?.kenar ? c.kenar.renk : etkilesim ? (bos ? '#1565c0' : '#9e9e9e') : 'none'}
        strokeWidth={secili || sorun ? 0.7 : c?.kenar ? c.kenar.kalinlik : 0.3} strokeDasharray={secili || sorun || c?.kenar ? undefined : '1.5 1'} strokeOpacity={bos && !secili ? 0.6 : 1} />
      {ic}
      {!ic && etkilesim && (<g style={{ pointerEvents: 'none' }}>
        <text x={r.x + r.w / 2} y={r.y + r.h / 2} fontSize={etiketBoy} textAnchor="middle" fill="#1565c0" fillOpacity={0.85}>{TUR_SIMGE[a.tur] ?? '+'} {a.ad}</text>
        {r.h > etiketBoy * 3.2 && <text x={r.x + r.w / 2} y={r.y + r.h / 2 + etiketBoy * 1.25} fontSize={etiketBoy * 0.8} textAnchor="middle" fill="#1565c0" fillOpacity={0.6}>tıklayıp doldurun</text>}</g>)}
      {sorun && etkilesim && <title>{sorun}</title>}
    </g>
  );
}

function SayfaIcerik({ p, no, olc, zoom, onek, secili, bulgular, etkilesim, sec, baslatSurukle }: {
  p: Project; no: number; olc: Olcer | null; zoom: number; onek: string; secili?: string | null; bulgular?: Bulgu[]; etkilesim?: boolean;
  sec?: (id: string) => void; baslatSurukle?: (a: Slot, e: React.PointerEvent) => void;
}) {
  const t = p.sablon;
  return (<>
    <rect x={0} y={0} width={t.sayfa.genislik} height={t.sayfa.yukseklik} fill="#fff" />
    {t.sabit.filter((o) => o.sayfa === no).map((o) => typeof o.cizim?.renk === 'string' && (
      <rect key={o.id} x={o.rect.x} y={o.rect.y} width={o.rect.w} height={o.rect.h} fill={o.cizim.renk as string}>{etkilesim && <title>Sabit şablon öğesi (kilitli)</title>}</rect>))}
    {t.alanlar.filter((a) => a.sayfa === no).map((a) => (
      <AlanCiz key={a.id} a={a} c={p.icerik[a.id]} olc={olc} onek={onek} zoom={zoom} etkilesim={etkilesim}
        secili={secili === a.id} sorun={bulgular?.find((b) => b.alanId === a.id && b.duzey === 'hata')?.mesaj}
        sec={() => sec?.(a.id)} baslatSurukle={(e) => baslatSurukle?.(a, e)} />))}
  </>);
}

/** Salt okunur küçük önizleme (ana ekran, liste). */
export function SayfaOnizleme({ p, no = 0, olc, genislik = 220 }: { p: Project; no?: number; olc: Olcer | null; genislik?: number }) {
  const t = p.sablon;
  return (
    <svg width="100%" style={{ maxWidth: genislik }} viewBox={`0 0 ${t.sayfa.genislik} ${t.sayfa.yukseklik}`} className="block bg-white shadow-sm ring-1 ring-stone-200" role="img" aria-label={`${p.ad} sayfa ${no + 1} önizlemesi`}>
      <SayfaIcerik p={p} no={no} olc={olc} zoom={0.3} onek={`on-${p.id}-${no}`} />
    </svg>
  );
}

export function Sayfa({ no, p, olc, zoom, secili, sec, bulgular, konumDegistir }: {
  no: number; p: Project; olc: Olcer | null; zoom: number; secili: string | null; sec: (id: string | null) => void;
  bulgular: Bulgu[]; konumDegistir: (id: string, k: { x: number; y: number }) => void;
}) {
  const t = p.sablon; const W = t.sayfa.genislik, H = t.sayfa.yukseklik;
  const surukle = useRef<{ id: string; bx: number; by: number; k: { x: number; y: number }; fx: number; fy: number } | null>(null);
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-stone-600">Sayfa {no + 1}</div>
      <svg width={W * MM_PX * zoom} height={H * MM_PX * zoom} viewBox={`0 0 ${W} ${H}`} className="block bg-white shadow-md"
        onPointerDown={(e) => { if (e.target === e.currentTarget) sec(null); }}
        onPointerMove={(e) => {
          const d = surukle.current; if (!d) return;
          konumDegistir(d.id, { x: Math.min(1, Math.max(0, d.k.x - (e.clientX - d.bx) / zoom / MM_PX / d.fx)), y: Math.min(1, Math.max(0, d.k.y - (e.clientY - d.by) / zoom / MM_PX / d.fy)) });
        }}
        onPointerUp={() => { surukle.current = null; }}>
        <SayfaIcerik p={p} no={no} olc={olc} zoom={zoom} onek={`ed-${no}`} secili={secili} bulgular={bulgular} etkilesim sec={sec}
          baslatSurukle={(a, e) => {
            const c = p.icerik[a.id]; if (!c?.foto || !c.fotoBoyut || fotoMod(a, c) === 'sigdir') return;
            const kk = kapla(c.fotoBoyut, a.rect, c.olcek, c.konum, 'kapla');
            surukle.current = { id: a.id, bx: e.clientX, by: e.clientY, k: c.konum ?? { x: 0.5, y: 0.5 }, fx: Math.max(0.001, kk.w - a.rect.w), fy: Math.max(0.001, kk.h - a.rect.h) };
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          }} />
      </svg>
    </div>
  );
}
