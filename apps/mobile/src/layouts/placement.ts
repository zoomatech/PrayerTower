// Stable per-post placement for themed layouts: the same post always lands the
// same way, and nothing about position is stored on the server.
export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

