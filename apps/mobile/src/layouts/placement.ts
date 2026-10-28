// Stable per-post placement for themed layouts: the same post always lands the
// same way, and nothing about position is stored on the server.
export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function vinePlacement(id: string) {
  const h = hashId(id);
  return {
    side: h % 2 === 0 ? ('left' as const) : ('right' as const),
    /** Leaf tilt, 15–20 degrees; the card text itself stays upright. */
    tilt: 15 + (h % 6),
    /** Extra stem length before this fruit, so the vine does not look ruled. */
    gap: 8 + (h % 4) * 6,
  };
}
