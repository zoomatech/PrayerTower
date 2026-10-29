// Reads the App Store listing drafts (docs/store/STORE_LISTING.md, or
// docs/store/open-circle/STORE_LISTING.md) so `eas metadata:push` uploads the
// same words Steve edits there. Each field is the code block under its label.
// Apple's limits are checked here, before anything reaches App Store Connect:
// name and subtitle 30, promotional text 170, description 4,000, keywords 100
// bytes (https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).
const fs = require('node:fs');
const path = require('node:path');

const DOCS = path.join(__dirname, '../../../docs/store');

/** The code block under a `**Label**` line or a `## Label` heading. */
function block(md, label) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`**${label}**`) || l === `## ${label}`);
  if (start < 0) return null;
  const open = lines.findIndex((l, i) => i > start && l.startsWith('```'));
  const close = lines.findIndex((l, i) => i > open && l.startsWith('```'));
  if (open < 0 || close < 0) return null;
  return lines.slice(open + 1, close).join('\n').trim();
}

const LIMITS = { title: 30, subtitle: 30, promoText: 170, description: 4000, releaseNotes: 4000, notes: 4000 };

/** Problems with a listing, in plain words; empty when it fits Apple's limits. */
function problems(info, notes) {
  const out = [];
  for (const [field, max] of Object.entries(LIMITS)) {
    const value = field === 'notes' ? notes : info[field];
    if (value == null) {
      if (field !== 'releaseNotes') out.push(`${field} is missing`);
    } else if ([...value].length > max) out.push(`${field} is ${[...value].length} characters (limit ${max})`);
  }
  const keywords = (info.keywords ?? []).join(',');
  if (Buffer.byteLength(keywords) > 100) out.push(`keywords are ${Buffer.byteLength(keywords)} bytes (limit 100)`);
  if (new Set(info.keywords).size !== (info.keywords ?? []).length) out.push('keywords repeat a word');
  return out;
}

/**
 * The listing for one edition: 'prayer-tower' or 'open-circle'. withWhatsNew adds
 * the update text from WHATS_NEW.md (Apple has no What's New for version 1.0).
 */
function listing(edition = 'prayer-tower', { withWhatsNew = false } = {}) {
  const md = fs.readFileSync(path.join(DOCS, edition === 'open-circle' ? 'open-circle/STORE_LISTING.md' : 'STORE_LISTING.md'), 'utf8');
  const info = {
    title: block(md, 'App name'),
    subtitle: block(md, 'Subtitle'),
    promoText: block(md, 'Promotional text'),
    description: block(md, 'Description'),
    keywords: (block(md, 'Keywords') ?? '').split(',').map((k) => k.trim()).filter(Boolean),
  };
  if (withWhatsNew && edition !== 'open-circle') {
    info.releaseNotes = block(fs.readFileSync(path.join(DOCS, 'WHATS_NEW.md'), 'utf8'), 'Ready for the first update (1.0.1 or 1.1)');
  }
  // The review account goes in its own fields, never in the notes.
  const notes = (block(md, 'App Review notes') ?? '')
    .split('\n')
    .filter((l) => !l.startsWith('Review account:'))
    .join('\n')
    .trim();
  return { info, notes, problems: problems(info, notes) };
}

module.exports = { block, listing, problems };
