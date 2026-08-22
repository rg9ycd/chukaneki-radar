import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../index.css", import.meta.url), "utf8");

describe("Home画面の表示順", () => {
  it("表示テーマはタイトル横のトグルだけで、独立したテーマ枠を置かない", () => {
    expect(homeSource).toContain('className="theme-toggle"');
    expect(homeSource).not.toContain('className="theme-mode"');
  });

  it("タイトル、地図、結果、設定、参加者入力の順に各セクションを配置する", () => {
    const headerPosition = homeSource.indexOf('<header className="app-header">');
    const mapPosition = homeSource.indexOf('<section className="map-area">');
    const resultPosition = homeSource.indexOf('className="result-card result-panel"');
    const operationPosition = homeSource.indexOf('<section className="operation-panel">');
    const membersPosition = homeSource.indexOf('<section className="members-panel">');

    expect(headerPosition).toBeGreaterThan(-1);
    expect(mapPosition).toBeGreaterThan(headerPosition);
    expect(resultPosition).toBeGreaterThan(mapPosition);
    expect(operationPosition).toBeGreaterThan(resultPosition);
    expect(membersPosition).toBeGreaterThan(operationPosition);
  });

  it("モード切替と算出ボタンは設定枠として保持する", () => {
    expect(homeSource).toContain('className="operation-panel"');
    expect(homeSource).toContain('className="mode-switch"');
    expect(homeSource).toContain('className="scan-button"');
    expect(cssSource).toContain(".operation-panel { display: grid;");
  });

  it("参加者追加時は古い計算結果を破棄し、人数差があっても距離表示で例外にしない", () => {
    expect(homeSource).toContain("const addParticipant = () => { setResult(null);");
    expect(homeSource).toContain("onClick={addParticipant}");
    expect(homeSource).toContain("formatIndividualDistance(result.individualKm[index])");
  });
});
