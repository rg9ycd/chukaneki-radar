export function formatIndividualDistance(distance: number | undefined): string {
  return typeof distance === "number" && Number.isFinite(distance)
    ? `${distance.toFixed(1)} km`
    : "— km";
}
