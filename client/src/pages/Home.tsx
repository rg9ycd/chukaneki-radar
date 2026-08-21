/**
 * Style reminder — Night Transit Map: a compact control rail opens onto a large, colorful shared map.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  Building2,
  ChevronRight,
  CircleAlert,
  Crosshair,
  Download,
  House,
  LoaderCircle,
  MapPinned,
  Minus,
  Plus,
  Radar,
  Route,
  ScanSearch,
  Share2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import RadarMap, { type MapParticipant } from "@/components/RadarMap";
import {
  getLineStations,
  getNearestStation,
  interpolatePoint,
  pickBestStation,
  searchStations,
  type Station,
} from "@/lib/geo";

const COLORS = ["#4fa3ff", "#ff6b7a", "#58d7ad", "#ffb14b", "#b790ff", "#28c9e8", "#f779ba", "#a9dc47", "#fb8c56", "#7d91ff"];
const DEMO_PARTICIPANTS = [
  { name: "あかり", start: "品川", home: "吉祥寺" },
  { name: "しょう", start: "渋谷", home: "大宮" },
  { name: "ゆい", start: "東京", home: "横浜" },
];

type Participant = MapParticipant & {
  startQuery: string;
  homeQuery: string;
  startSuggestions: Station[];
  homeSuggestions: Station[];
};

type CalculationResult = {
  station: Station;
  totalKm: number;
  individualKm: number[];
  candidateCount: number;
};

function makeParticipant(index: number): Participant {
  return {
    id: crypto.randomUUID(),
    name: "",
    color: COLORS[index % COLORS.length],
    startQuery: "",
    homeQuery: "",
    startStation: null,
    homeStation: null,
    startSuggestions: [],
    homeSuggestions: [],
  };
}

function StationField({
  icon,
  label,
  value,
  suggestions,
  selectedStation,
  onChange,
  onSelect,
  onClear,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suggestions: Station[];
  selectedStation: Station | null;
  onChange: (value: string) => void;
  onSelect: (station: Station) => void;
  onClear: () => void;
}) {
  return (
    <label className="station-field">
      <span className="field-label">{icon}{label}</span>
      <div className={`station-input-wrap ${selectedStation ? "is-selected" : ""}`}>
        <input
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder="駅名を入力"
          autoComplete="off"
          aria-label={label}
        />
        {selectedStation ? (
          <button type="button" className="clear-station" onClick={onClear} aria-label={`${label}を変更`}><X size={14} /></button>
        ) : null}
      </div>
      {selectedStation ? <span className="selected-station">{selectedStation.line}</span> : null}
      {!selectedStation && suggestions.length > 0 ? (
        <div className="station-suggestions" role="listbox">
          {suggestions.map(station => (
            <button type="button" key={station.id} onClick={() => onSelect(station)}>
              <span>{station.name}</span>
              <small>{station.line} · {station.prefecture}</small>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function ParticipantCard({
  participant,
  index,
  canRemove,
  onRemove,
  onUpdate,
}: {
  participant: Participant;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
  onUpdate: (update: Partial<Participant>) => void;
}) {
  const search = (value: string, field: "start" | "home") => {
    const suggestionsKey = field === "start" ? "startSuggestions" : "homeSuggestions";
    const stationKey = field === "start" ? "startStation" : "homeStation";
    const queryKey = field === "start" ? "startQuery" : "homeQuery";
    onUpdate({ [queryKey]: value, [stationKey]: null, [suggestionsKey]: [] });
    if (!value.trim()) return;
    window.setTimeout(async () => {
      try {
        const stations = await searchStations(value);
        onUpdate({ [suggestionsKey]: stations });
      } catch {
        onUpdate({ [suggestionsKey]: [] });
      }
    }, 280);
  };
  const select = (station: Station, field: "start" | "home") => {
    const update = field === "start"
      ? { startStation: station, startQuery: station.name, startSuggestions: [] }
      : { homeStation: station, homeQuery: station.name, homeSuggestions: [] };
    onUpdate(update);
  };

  return (
    <article className="participant-card" style={{ "--participant-color": participant.color } as React.CSSProperties}>
      <div className="participant-card-top">
        <span className="participant-index"><i /> MEMBER {String(index + 1).padStart(2, "0")}</span>
        {canRemove ? <button type="button" className="icon-button" onClick={onRemove} aria-label="参加者を削除"><Minus size={16} /></button> : null}
      </div>
      <input
        className="member-name"
        value={participant.name}
        onChange={event => onUpdate({ name: event.target.value })}
        placeholder={`メンバー${index + 1}`}
        aria-label={`メンバー${index + 1}の名前`}
      />
      <div className="station-fields">
        <StationField
          icon={<Building2 size={13} />}
          label="出発駅"
          value={participant.startQuery}
          suggestions={participant.startSuggestions}
          selectedStation={participant.startStation}
          onChange={value => search(value, "start")}
          onSelect={station => select(station, "start")}
          onClear={() => onUpdate({ startStation: null, startQuery: "", startSuggestions: [] })}
        />
        <StationField
          icon={<House size={13} />}
          label="帰宅駅"
          value={participant.homeQuery}
          suggestions={participant.homeSuggestions}
          selectedStation={participant.homeStation}
          onChange={value => search(value, "home")}
          onSelect={station => select(station, "home")}
          onClear={() => onUpdate({ homeStation: null, homeQuery: "", homeSuggestions: [] })}
        />
      </div>
    </article>
  );
}

export default function Home() {
  const [participants, setParticipants] = useState<Participant[]>(() => [makeParticipant(0), makeParticipant(1), makeParticipant(2)]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const shareCanvasRef = useRef<HTMLDivElement>(null);

  const namedParticipants = useMemo(
    () => participants.map((participant, index) => ({ ...participant, name: participant.name.trim() || `メンバー${index + 1}` })),
    [participants],
  );

  const updateParticipant = (id: string, update: Partial<Participant>) => {
    setResult(null);
    setParticipants(current => current.map(participant => (participant.id === id ? { ...participant, ...update } : participant)));
  };

  const resolveAllStations = async () => {
    const resolved = await Promise.all(
      participants.map(async participant => {
        const next = { ...participant };
        if (!next.startStation && next.startQuery.trim()) {
          const matches = await searchStations(next.startQuery);
          next.startStation = matches[0] ?? null;
        }
        if (!next.homeStation && next.homeQuery.trim()) {
          const matches = await searchStations(next.homeQuery);
          next.homeStation = matches[0] ?? null;
        }
        return next;
      }),
    );
    setParticipants(resolved);
    return resolved;
  };

  const calculate = async () => {
    setIsCalculating(true);
    try {
      const resolved = await resolveAllStations();
      const incomplete = resolved.some(participant => !participant.startStation || !participant.homeStation);
      if (incomplete) {
        toast.error("全員の出発駅・帰宅駅を選択してください。", { description: "候補が表示されたら、該当する駅をタップしてください。" });
        return;
      }
      const inputStations = resolved.flatMap(participant => [participant.startStation!, participant.homeStation!]);
      const candidates = new Map<string, Station>();
      inputStations.forEach(station => candidates.set(`${station.name}-${station.line}-${station.lat}-${station.lng}`, station));
      const lines = Array.from(new Set(inputStations.map(station => station.line))).filter(line => line !== "路線情報なし").slice(0, 16);
      const routeStations = await Promise.all(lines.map(line => getLineStations(line).catch(() => [])));
      routeStations.flat().forEach(station => candidates.set(`${station.name}-${station.line}-${station.lat}-${station.lng}`, station));
      const samplePoints = resolved.flatMap(participant =>
        [0.25, 0.5, 0.75].map(progress => interpolatePoint(participant.startStation!, participant.homeStation!, progress)),
      );
      const nearbyStations = await Promise.all(samplePoints.map(point => getNearestStation(point.lat, point.lng).catch(() => [])));
      nearbyStations.flat().forEach(station => candidates.set(`${station.name}-${station.line}-${station.lat}-${station.lng}`, station));
      const best = pickBestStation(resolved, Array.from(candidates.values()));
      if (!best) throw new Error("候補駅を評価できませんでした。");
      setResult({ ...best, candidateCount: candidates.size });
      toast.success(`${best.station.name}駅をレーダーが捕捉しました。`, { description: `${candidates.size}駅から、全員の線に最も近い駅を選びました。` });
    } catch (error) {
      toast.error("計算を完了できませんでした。", { description: error instanceof Error ? error.message : "通信状況を確認して、もう一度お試しください。" });
    } finally {
      setIsCalculating(false);
    }
  };

  const loadDemo = async () => {
    setIsDemoLoading(true);
    try {
      const loaded = await Promise.all(
        DEMO_PARTICIPANTS.map(async (member, index) => {
          const [startMatches, homeMatches] = await Promise.all([searchStations(member.start), searchStations(member.home)]);
          const participant = makeParticipant(index);
          return {
            ...participant,
            name: member.name,
            startQuery: member.start,
            homeQuery: member.home,
            startStation: startMatches[0] ?? null,
            homeStation: homeMatches[0] ?? null,
          };
        }),
      );
      setParticipants(loaded);
      setResult(null);
      toast.message("体験データを入力しました。", { description: "「レーダーを走査」を押すと集合駅を計算します。" });
    } catch {
      toast.error("体験データを読み込めませんでした。通信状況を確認してください。");
    } finally {
      setIsDemoLoading(false);
    }
  };

  const shareImage = async () => {
    if (!result || !shareCanvasRef.current) return;
    try {
      const image = await toPng(shareCanvasRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: "#07111f" });
      const response = await fetch(image);
      const blob = await response.blob();
      const file = new File([blob], `chukaneki-radar-${result.station.name}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "中間駅レーダー", text: `集合候補は ${result.station.name}駅！`, files: [file] });
      } else {
        const link = document.createElement("a");
        link.href = image;
        link.download = file.name;
        link.click();
        toast.success("結果画像を保存しました。", { description: "画像をお好みのアプリで共有してください。" });
      }
    } catch {
      toast.error("画像を作成できませんでした。", { description: "画面のスクリーンショットでの共有をお試しください。" });
    }
  };

  return (
    <main className="app-shell">
      <aside className="control-rail">
        <header className="brand-block">
          <div className="brand-mark-frame" aria-label="中間駅レーダーのロゴ">
            <img
              className="brand-mark"
              src="/manus-storage/radar-logo_0dcf6967.png"
              alt=""
              onError={event => event.currentTarget.classList.add("asset-unavailable")}
            />
            <span className="brand-mark-fallback" aria-hidden="true"><i /><i /><i /><i /><b>◎</b></span>
          </div>
          <div>
            <p className="eyebrow"><Radar size={13} /> COMMUTE RADAR</p>
            <h1>中間駅<br /><em>レーダー</em></h1>
          </div>
        </header>
        <p className="brand-copy">みんなの移動線が重なる、<br />集まりやすい駅を探す。</p>
        <section className="rail-status">
          <span><Users size={14} /> {participants.length} MEMBERS</span>
          <span><Route size={14} /> STRAIGHT-LINE</span>
        </section>
        <div className="member-list">
          {participants.map((participant, index) => (
            <ParticipantCard
              key={participant.id}
              participant={participant}
              index={index}
              canRemove={participants.length > 2}
              onRemove={() => { setParticipants(current => current.filter(item => item.id !== participant.id)); setResult(null); }}
              onUpdate={update => updateParticipant(participant.id, update)}
            />
          ))}
        </div>
        <div className="rail-actions">
          <button type="button" className="add-member-button" disabled={participants.length >= 10} onClick={() => setParticipants(current => [...current, makeParticipant(current.length)])}>
            <Plus size={17} /> 参加者を追加 <span>{participants.length}/10</span>
          </button>
          <button type="button" className="scan-button" disabled={isCalculating} onClick={calculate}>
            {isCalculating ? <LoaderCircle className="spin" size={18} /> : <ScanSearch size={18} />}
            {isCalculating ? "レーダーを走査中…" : "レーダーを走査"}
            <ChevronRight size={17} />
          </button>
          <button type="button" className="demo-button" disabled={isDemoLoading} onClick={loadDemo}>
            {isDemoLoading ? <LoaderCircle className="spin" size={15} /> : <MapPinned size={15} />} 体験データを入力
          </button>
        </div>
        <footer className="rail-footer">駅データ：HeartRails Express<br />地図：OpenStreetMap contributors</footer>
      </aside>

      <section className="map-stage" ref={shareCanvasRef}>
        <div className="map-chrome top-chrome"><span>LIVE MAP / JAPAN</span><span className="live-dot" /> <span>READY</span></div>
        <RadarMap participants={namedParticipants} result={result} />
        <div className="radar-overlay" aria-hidden="true">
          <span className="ghost-route ghost-route-one" />
          <span className="ghost-route ghost-route-two" />
          <span className="ghost-route ghost-route-three" />
          <span className="radar-sweep" />
          <span className="radar-target-ghost"><i /><i /><b /></span>
          <span className="coordinate-ticks ticks-top" />
          <span className="coordinate-ticks ticks-bottom" />
        </div>
        <div className="legend-card">
          <div><span className="legend-dot start-dot" /> 出発駅</div>
          <div><span className="legend-dot home-dot" /> 帰宅駅</div>
          <div><span className="legend-target">◎</span> 集合候補</div>
        </div>
        {result ? (
          <section className="result-card" aria-live="polite">
            <img className="result-glow" src="/manus-storage/radar-glow_89c3ad34.png" alt="" />
            <div className="result-kicker"><Crosshair size={14} /> PROPOSED MEETUP</div>
            <div className="station-result-title"><span>集合候補</span><h2>{result.station.name}<small>駅</small></h2></div>
            <p className="result-line">{result.station.line} · {result.station.prefecture}</p>
            <div className="metric-row">
              <div><span>線からの距離合計</span><strong>{result.totalKm.toFixed(1)}<small> km</small></strong></div>
              <div><span>評価した候補駅</span><strong>{result.candidateCount}<small> 駅</small></strong></div>
            </div>
            <div className="fairness-block">
              <p><span>各メンバーの移動線から</span><b>近さのバランス</b></p>
              {namedParticipants.map((participant, index) => (
                <div className="fairness-row" key={participant.id}>
                  <span className="member-color" style={{ background: participant.color }} />
                  <span>{participant.name}</span>
                  <strong>{result.individualKm[index].toFixed(1)} km</strong>
                </div>
              ))}
            </div>
            <button type="button" className="share-button" onClick={shareImage}><Share2 size={17} /> 結果画像を共有</button>
          </section>
        ) : (
          <section className="empty-result">
            <span className="empty-radar"><Radar size={28} /></span>
            <p className="eyebrow">AWAITING ROUTES</p>
            <h2>みんなの線が<br />ここに集まる。</h2>
            <p>出発駅と帰宅駅を入力して<br />レーダーを走査してください。</p>
          </section>
        )}
        <div className="map-chrome bottom-chrome"><span>2–10 MEMBERS</span><span>・</span><span>2D DISTANCE SCORE</span><span>・</span><span>v1.0</span></div>
      </section>
      <div className="mobile-safety"><CircleAlert size={15} /> 駅候補は駅名を入力して選択してください。</div>
    </main>
  );
}
