import { describe, expect, it } from "vitest";
import { formatIndividualDistance } from "./resultDisplay";

describe("formatIndividualDistance", () => {
  it("計算済みの距離を小数第1位のkm表示にする", () => {
    expect(formatIndividualDistance(12.34)).toBe("12.3 km");
  });

  it("3人計算後に4人目を追加したような距離未計算の状態でも例外を出さない", () => {
    expect(() => formatIndividualDistance(undefined)).not.toThrow();
    expect(formatIndividualDistance(undefined)).toBe("— km");
  });
});
