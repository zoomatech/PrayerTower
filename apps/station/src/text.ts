// Preparing a prayer's text for PSK31: the 97.113(a)(4) content filter,
// folding to the ASCII that Varicode covers, and splitting into pieces that
// each end with the call sign (97.119).

/** "Señor Núñez" -> "Senor Nunez": strip accents, then drop anything outside printable ASCII. */
export function foldAscii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Default blocklist for obscene or indecent words; extend with BLOCKLIST_FILE. */
export const DEFAULT_BLOCKLIST = ['fuck', 'shit', 'cunt', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'whore', 'slut', 'nigger', 'faggot', 'puta', 'mierda', 'pendejo', 'cabron', 'chinga'];

const SUFFIXES = ['', 's', 'es', 'ed', 'er', 'ers', 'ing', 'y', 'o', 'a', 'os', 'as'];

/** False when any blocklisted word appears, alone or with a common ending (case and accents ignored). */
export function passesFilter(text: string, blocklist: readonly string[]): boolean {
  const words = new Set(foldAscii(text).toLowerCase().split(/[^a-z0-9]+/));
  return !blocklist.some((bad) => SUFFIXES.some((end) => words.has(bad.toLowerCase() + end)));
}

/**
 * Split at word boundaries into pieces of at most maxChars of text, each
 * followed by " de CALL". A piece is short enough to stay well under the
 * 10-minute identification interval (about 50 wpm, ~2,900 characters).
 */
export function splitPieces(text: string, maxChars: number, callSign: string): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    for (let w = word; w.length; ) {
      const room = current ? maxChars - current.length - 1 : maxChars;
      if (w.length <= room) {
        current = current ? `${current} ${w}` : w;
        w = '';
      } else if (!current) {
        pieces.push(w.slice(0, maxChars)); // a single word longer than a piece
        w = w.slice(maxChars);
      } else {
        pieces.push(current);
        current = '';
      }
    }
  }
  if (current) pieces.push(current);
  return pieces.map((p) => `${p} de ${callSign}`);
}
