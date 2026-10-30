// A post's row of action buttons as data: which buttons, their names, which are on, and
// what a press does. A skin draws them however it likes (round icons, neon line icons
// inside the frame) and calls `press`; the behaviour is the same in every skin.
import { ACTION_LABELS, type Card, type CardAction } from '@prayer-tower/shared';
import { useState, type ReactNode } from 'react';

import { useMeaningChooser } from '@/components/meaning-chooser';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';

export interface ActionButton {
  action: CardAction;
  /** Its name: the screen reader's label, and the tip on hover or a long press. */
  name: string;
  /** The tip's words, which change once the member has done it (e.g. "Committed"). */
  tip: string;
  /** Pressed in: the member has committed, or liked it. */
  active: boolean;
  press: () => void;
  /** With emoji meanings on: the matching emoji's meanings, and a long press to choose one. */
  meanings: { words: string; open: () => void; action: string; hint: string } | null;
}

export interface ActionRow {
  buttons: ActionButton[];
  /** Likes, counted here so a like shows at once. */
  thumbsUp: number;
  /** The meanings chooser; render it once beside the row. */
  sheet: ReactNode;
}

/**
 * The buttons for one post, in the server's order. `act` runs every action except thumbs
 * up, which toggles right here with no sheet and shows at once (undone if the server says no).
 * `meanings` turns the emoji meanings on (off on a post's own page, where the full tree shows).
 */
export function useActionRow(card: Card, act: (card: Card, action: CardAction) => void, meanings = true): ActionRow {
  const { t, label } = useLocale();
  const [thumbs, setThumbs] = useState({ n: card.counts.thumbsUp ?? 0, mine: !!card.myQuickReactions?.includes('thumbs_up') });
  const thumbsUp = () => {
    const on = !thumbs.mine;
    setThumbs((s) => ({ n: Math.max(0, s.n + (on ? 1 : -1)), mine: on }));
    api.quickReact(card.id, 'thumbs_up', on).then(
      (r) => setThumbs({ n: r.thumbsUp, mine: r.mine.includes('thumbs_up') }),
      () => setThumbs((s) => ({ n: Math.max(0, s.n + (on ? -1 : 1)), mine: !on })),
    );
  };
  const chooser = useMeaningChooser(card.id, card.body, meanings);
  const meaningsFor = (action: string) => {
    const e = chooser.forAction(action);
    return e ? { words: chooser.words(e), open: () => chooser.open(e), action: t('meanings.choose', { emoji: e.emoji }), hint: t('meanings.holdHint') } : null;
  };
  const buttons = card.actions.map((action): ActionButton => {
    const active = (action === 'commit' && !!card.myCommitment) || (action === 'thumbs_up' && thumbs.mine);
    const name = label('action', action, ACTION_LABELS[action]);
    return {
      action,
      name,
      tip: active ? t('card.committedLabel') : name,
      active,
      press: () => (action === 'thumbs_up' ? thumbsUp() : act(card, action)),
      meanings: meaningsFor(action),
    };
  });
  return { buttons, thumbsUp: thumbs.n, sheet: chooser.sheet };
}
