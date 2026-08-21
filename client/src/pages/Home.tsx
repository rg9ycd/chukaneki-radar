/**
 * Style reminder — Night Transit Map: a compact control rail opens onto a large, colorful shared map.
 */

import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Building2, ChevronRight, CircleAlert, Crosshair, House, LoaderCircle, MapPinned, MapPin, Minus, Moon, Plus, Radar, Route, ScanSearch, Share2, Sun, Users, X } from "lucide-react";
import { toast } from "sonner";
import RadarMap, { type MapParticipant, type MapResult } from "@/components/RadarMap";
import { distanceToRouteKm, findOptimalPoint, getLineStations, getNearestStation, interpolatePoint, pickBestStation, searchStations, type RouteInput, type Station } from "@/lib/geo";

const COLORS = ["#4fa3ff", "#ff6b7a", "#58d7ad", "#ffb14b", "#b790ff", "#28c9e8", "#f779ba", "#a9dc47", "#fb8c56", "#7d91ff"];
const DEMO_PARTICIPANTS = [{ name: "あかり", start: "品川", home: "吉祥寺" }, { name: "しょう", start: "渋谷", home: "大宮" }, { name: "ゆい", start: "東京", home: "横浜" }];
type MeetingMode = "station" | "point";
type ThemeMode = "dark" | "light";
type Participant = MapParticipant & { startQuery: string; homeQuery: string; hasHome: boolean; startSuggestions: Station[]; homeSuggestions: Station[] };
type CalculationResult = MapResult;

function makeParticipant(index: number): Participant { return { id: crypto.randomUUID(), name: "", color: COLORS[index % COLORS.length], startQuery: "", homeQuery: "", hasHome: true, startStation: null, homeStation: null, startSuggestions: [], homeSuggestions: [] }; }

function StationField({ icon, label, value, suggestions, selectedStation, onChange, onSelect, onClear }: { icon: React.ReactNode; label: string; value: string; suggestions: Station[]; selectedStation: Station | null; onChange: (value: string) => void; onSelect: (station: Station) => void; onClear: () => void }) {
  return <label className="station-field"><span className="field-label">{icon}{label}</span><div className={`station-input-wrap ${selectedStation ? "is-selected" : ""}`}><input value={value} onChange={event => onChange(event.target.value)} placeholder="駅名を入力" autoComplete="off" aria-label={label} />{selectedStation ? <button type="button" className="clear-station" onClick={onClear} aria-label={`${label}を変更`}><X size={14} /></button> : null}</div>{selectedStation ? <span className="selected-station">{selectedStation.line}</span> : null}{!selectedStation && suggestions.length > 0 ? <div className="station-suggestions" role="listbox">{suggestions.map(station => <button type="button" key={station.id} onClick={() => onSelect(station)}><span>{station.name}</span><small>{station.line} · {station.prefecture}</small></button>)}</div> : null}</label>;
}

function ParticipantCard({ participant, index, canRemove, onRemove, onUpdate }: { participant: Participant; index: number; canRemove: boolean; onRemove: () => void; onUpdate: (update: Partial<Participant>) => void }) {
  const search = (value: string, field: "start" | "home") => {
    const suggestionsKey = field === "start" ? "startSuggestions" : "homeSuggestions";
    const stationKey = field === "start" ? "startStation" : "homeStation";
    const queryKey = field === "start" ? "startQuery" : "homeQuery";
    onUpdate({ [queryKey]: value, [stationKey]: null, [suggestionsKey]: [] });
    if (!value.trim()) return;
    window.setTimeout(async () => { try { onUpdate({ [suggestionsKey]: await searchStations(value) }); } catch { onUpdate({ [suggestionsKey]: [] }); } }, 280);
  };
  const select = (station: Station, field: "start" | "home") => onUpdate(field === "start" ? { startStation: station, startQuery: station.name, startSuggestions: [] } : { homeStation: station, homeQuery: station.name, homeSuggestions: [] });
  return <article className="participant-card" style={{ "--participant-color": participant.color } as React.CSSProperties}>
    <div className="participant-card-top"><span className="participant-index"><i /> MEMBER {String(index + 1).padStart(2, "0")}</span>{canRemove ? <button type="button" className="icon-button" onClick={onRemove} aria-label="参加者を削除"><Minus size={16} /></button> : null}</div>
    <input className="member-name" value={participant.name} onChange={event => onUpdate({ name: event.target.value })} placeholder={`メンバー${index + 1}`} aria-label={`メンバー${index + 1}の名前`} />
    <div className="station-fields">
      <StationField icon={<Building2 size={13} />} label="出発駅" value={participant.startQuery} suggestions={participant.startSuggestions} selectedStation={participant.startStation} onChange={value => search(value, "start")} onSelect={station => select(station, "start")} onClear={() => onUpdate({ startStation: null, startQuery: "", startSuggestions: [] })} />
      {participant.hasHome ? <div className="home-field-wrap"><StationField icon={<House size={13} />} label="帰宅駅（任意）" value={participant.homeQuery} suggestions={participant.homeSuggestions} selectedStation={participant.homeStation} onChange={value => search(value, "home")} onSelect={station => select(station, "home")} onClear={() => onUpdate({ homeStation: null, homeQuery: "", homeSuggestions: [] })} /><button type="button" className="optional-toggle" onClick={() => onUpdate({ hasHome: false, homeStation: null, homeQuery: "", homeSuggestions: [] })}>帰宅駅を使わない</button></div> : <button type="button" className="home-optin" onClick={() => onUpdate({ hasHome: true })}><House size={13} /><span>帰宅駅を追加</span><small>任意</small></button>}
    </div>
  </article>;
}

export default function Home() {
  const [participants, setParticipants] = useState<Participant[]>(() => [makeParticipant(0), makeParticipant(1), makeParticipant(2)]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [meetingMode, setMeetingMode] = useState<MeetingMode>("station");
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const shareCanvasRef = useRef<HTMLDivElement>(null);
  const namedParticipants = useMemo(() => participants.map((participant, index) => ({ ...participant, name: participant.name.trim() || `メンバー${index + 1}` })), [participants]);
  const updateParticipant = (id: string, update: Partial<Participant>) => { setResult(null); setParticipants(current => current.map(participant => participant.id === id ? { ...participant, ...update } : participant)); };
  const resolveAllStations = async () => {
    const resolved = await Promise.all(participants.map(async participant => {
      const next = { ...participant };
      if (!next.startStation && next.startQuery.trim()) next.startStation = (await searchStations(next.startQuery))[0] ?? null;
      if (next.hasHome && !next.homeStation && next.homeQuery.trim()) next.homeStation = (await searchStations(next.homeQuery))[0] ?? null;
      return next;
    }));
    setParticipants(resolved); return resolved;
  };
  const calculate = async () => {
    setIsCalculating(true);
    try {
      const resolved = await resolveAllStations();
      if (resolved.some(participant => !participant.startStation || (participant.hasHome && !participant.homeStation))) { toast.error("全員の出発駅を選択してください。", { description: "帰宅駅を使う場合は、該当する駅も候補から選択してください。" }); return; }
      const routes: RouteInput[] = resolved.map(participant => ({ startStation: participant.startStation!, homeStation: participant.hasHome ? participant.homeStation : null }));
      if (meetingMode === "point") {
        const bestPoint = findOptimalPoint(routes);
        if (!bestPoint) throw new Error("最適地点を計算できませんでした。");
        setResult({ mode: "point", point: bestPoint.point, totalKm: bestPoint.totalKm, individualKm: bestPoint.individualKm, candidateCount: 0 });
        toast.success("計算上の最適地点を捕捉しました。", { description: "駅に限定せず、地図上で最も近い一点を表示しています。" }); return;
      }
      const inputStations = routes.flatMap(route => [route.startStation, ...(route.homeStation ? [route.homeStation] : [])]);
      const candidates = new Map<string, Station>(); inputStations.forEach(station => candidates.set(`${station.name}-${station.line}-${station.lat}-${station.lng}`, station));
      const lines = Array.from(new Set(inputStations.map(station => station.line))).filter(line => line !== "路線情報なし").slice(0, 16);
      (await Promise.all(lines.map(line => getLineStations(line).catch(() => [])))).flat().forEach(station => candidates.set(`${station.name}-${station.line}-${station.lat}-${station.lng}`, station));
      const samplePoints = routes.flatMap(route => route.homeStation ? [0.25, 0.5, 0.75].map(progress => interpolatePoint(route.startStation, route.homeStation!, progress)) : [{ lat: route.startStation.lat, lng: route.startStation.lng }]);
      (await Promise.all(samplePoints.map(point => getNearestStation(point.lat, point.lng).catch(() => [])))).flat().forEach(station => candidates.set(`${station.name}-${station.line}-${station.lat}-${station.lng}`, station));
      const best = pickBestStation(routes, Array.from(candidates.values())); if (!best) throw new Error("候補駅を評価できませんでした。");
      setResult({ mode: "station", point: { lat: best.station.lat, lng: best.station.lng }, station: best.station, totalKm: best.totalKm, individualKm: best.individualKm, candidateCount: candidates.size });
      toast.success(`${best.station.name}駅をレーダーが捕捉しました。`, { description: `${candidates.size}駅から、全員の線または出発地点に最も近い駅を選びました。` });
    } catch (error) { toast.error("計算を完了できませんでした。", { description: error instanceof Error ? error.message : "通信状況を確認して、もう一度お試しください。" }); } finally { setIsCalculating(false); }
  };
  const loadDemo = async () => {
    setIsDemoLoading(true); try {
      const loaded = await Promise.all(DEMO_PARTICIPANTS.map(async (member, index) => { const [startMatches, homeMatches] = await Promise.all([searchStations(member.start), searchStations(member.home)]); return { ...makeParticipant(index), name: member.name, startQuery: member.start, homeQuery: member.home, startStation: startMatches[0] ?? null, homeStation: homeMatches[0] ?? null }; }));
      setParticipants(loaded); setResult(null); toast.message("体験データを入力しました。", { description: "「レーダーを走査」を押すと集合候補を計算します。" });
    } catch { toast.error("体験データを読み込めませんでした。通信状況を確認してください。"); } finally { setIsDemoLoading(false); }
  };
  const shareImage = async () => {
    if (!result || !shareCanvasRef.current) return;
    try { const image = await toPng(shareCanvasRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: theme === "dark" ? "#07111f" : "#eef4f7" }); const response = await fetch(image); const blob = await response.blob(); const label = result.mode === "station" ? result.station?.name ?? "集合地点" : "最適地点"; const file = new File([blob], `chukaneki-radar-${label}.png`, { type: "image/png" }); if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: "中間駅レーダー", text: `集合候補は ${label}${result.mode === "station" ? "駅" : ""}！`, files: [file] }); else { const link = document.createElement("a"); link.href = image; link.download = file.name; link.click(); toast.success("結果画像を保存しました。", { description: "画像をお好みのアプリで共有してください。" }); } } catch { toast.error("画像を作成できませんでした。", { description: "画面のスクリーンショットでの共有をお試しください。" }); }
  };
  const resultTitle = result?.mode === "station" ? result.station?.name : "最適地点";
  return <main className={`app-shell ${theme}`}>
    <aside className="control-rail">
      <header className="brand-block"><div className="brand-mark-frame" aria-label="中間駅レーダーのロゴ"><img className="brand-mark" src="/manus-storage/radar-logo_0dcf6967.png" alt="" onError={event => event.currentTarget.classList.add("asset-unavailable")} /><span className="brand-mark-fallback" aria-hidden="true"><i /><i /><i /><i /><b>◎</b></span></div><div><p className="eyebrow"><Radar size={13} /> COMMUTE RADAR</p><h1>中間駅<br /><em>レーダー</em></h1></div><button type="button" className="theme-toggle" onClick={() => setTheme(current => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "ライトモードへ切替" : "ダークモードへ切替"}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === "dark" ? "LIGHT" : "DARK"}</span></button></header>
      <p className="brand-copy">みんなの移動線が重なる、<br />集まりやすい場所を探す。</p>
      <section className="rail-status"><span><Users size={14} /> {participants.length} MEMBERS</span><span><Route size={14} /> STRAIGHT-LINE</span></section>
      <section className="mode-switch" aria-label="集合候補の表示モード"><p className="mode-label">MEETUP MODE</p><div><button type="button" className={meetingMode === "station" ? "is-active" : ""} onClick={() => { setMeetingMode("station"); setResult(null); }}><MapPinned size={14} /><span>最寄り駅</span><small>駅から選ぶ</small></button><button type="button" className={meetingMode === "point" ? "is-active" : ""} onClick={() => { setMeetingMode("point"); setResult(null); }}><MapPin size={14} /><span>最適地点</span><small>地図上の一点</small></button></div></section>
      <div className="member-list">{participants.map((participant, index) => <ParticipantCard key={participant.id} participant={participant} index={index} canRemove={participants.length > 2} onRemove={() => { setParticipants(current => current.filter(item => item.id !== participant.id)); setResult(null); }} onUpdate={update => updateParticipant(participant.id, update)} />)}</div>
      <div className="rail-actions"><button type="button" className="add-member-button" disabled={participants.length >= 10} onClick={() => setParticipants(current => [...current, makeParticipant(current.length)])}><Plus size={17} /> 参加者を追加 <span>{participants.length}/10</span></button><button type="button" className="scan-button" disabled={isCalculating} onClick={calculate}>{isCalculating ? <LoaderCircle className="spin" size={18} /> : <ScanSearch size={18} />}{isCalculating ? "レーダーを走査中…" : meetingMode === "station" ? "駅をレーダーで探す" : "最適地点を算出"}<ChevronRight size={17} /></button><button type="button" className="demo-button" disabled={isDemoLoading} onClick={loadDemo}>{isDemoLoading ? <LoaderCircle className="spin" size={15} /> : <MapPinned size={15} />} 体験データを入力</button></div>
      <footer className="rail-footer">駅データ：HeartRails Express<br />地図：OpenStreetMap contributors</footer>
    </aside>
    <section className="map-area"><section className="map-stage" ref={shareCanvasRef}>
      <div className="map-chrome top-chrome"><span>LIVE MAP / JAPAN</span><span className="live-dot" /> <span>{meetingMode === "station" ? "STATION MODE" : "POINT MODE"}</span></div><RadarMap participants={namedParticipants} result={result} />
      <div className="radar-overlay" aria-hidden="true"><span className="ghost-route ghost-route-one" /><span className="ghost-route ghost-route-two" /><span className="ghost-route ghost-route-three" /><span className="radar-sweep" /><span className="radar-target-ghost"><i /><i /><b /></span><span className="coordinate-ticks ticks-top" /><span className="coordinate-ticks ticks-bottom" /></div>
      <div className="legend-card"><div><span className="legend-dot start-dot" /> 出発駅</div><div><span className="legend-dot home-dot" /> 帰宅駅</div><div><span className="legend-target">◎</span> {meetingMode === "station" ? "集合候補" : "最適地点"}</div></div>
      {result ? <section className="result-card" aria-live="polite"><img className="result-glow" src="/manus-storage/radar-glow_89c3ad34.png" alt="" /><div className="result-kicker"><Crosshair size={14} /> {result.mode === "station" ? "PROPOSED STATION" : "CALCULATED POINT"}</div><div className="station-result-title"><span>{result.mode === "station" ? "集合候補" : "集合地点"}</span><h2>{resultTitle}<small>{result.mode === "station" ? "駅" : ""}</small></h2></div><p className="result-line">{result.mode === "station" ? `${result.station?.line} · ${result.station?.prefecture}` : `緯度 ${result.point.lat.toFixed(5)} · 経度 ${result.point.lng.toFixed(5)}`}</p><div className="metric-row"><div><span>線・地点からの距離合計</span><strong>{result.totalKm.toFixed(1)}<small> km</small></strong></div><div><span>{result.mode === "station" ? "評価した候補駅" : "計算方式"}</span><strong>{result.mode === "station" ? result.candidateCount : "連続"}<small>{result.mode === "station" ? " 駅" : " 最適化"}</small></strong></div></div><div className="fairness-block"><p><span>各メンバーから</span><b>近さのバランス</b></p>{namedParticipants.map((participant, index) => <div className="fairness-row" key={participant.id}><span className="member-color" style={{ background: participant.color }} /><span>{participant.name}</span><strong>{result.individualKm[index].toFixed(1)} km</strong></div>)}</div><button type="button" className="share-button" onClick={shareImage}><Share2 size={17} /> 結果画像を共有</button></section> : <section className="empty-result"><span className="empty-radar"><Radar size={28} /></span><p className="eyebrow">AWAITING ROUTES</p><h2>みんなの線が<br />ここに集まる。</h2><p>出発駅だけでも利用できます。<br />帰宅駅は任意で追加してください。</p></section>}
      <div className="map-chrome bottom-chrome"><span>2–10 MEMBERS</span><span>・</span><span>FIXED 16:10 MAP</span><span>・</span><span>v1.1</span></div>
    </section></section><div className="mobile-safety"><CircleAlert size={15} /> 出発駅は必須、帰宅駅は任意です。駅候補をタップして確定してください。</div>
  </main>;
}
