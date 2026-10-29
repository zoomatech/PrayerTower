// Conversation helpers (docs/CONVERSATION_HELPERS.md), worked out on the device so
// nothing a member reads or types is sent anywhere for them. Talk comes in pairs
// (Schegloff 1968; the Switchboard DAMSL tags for openings, thanks and closings),
// so the reply is chosen by the kind of move, one suggestion per move, as Smart
// Reply does (Kannan et al. 2016). Research: research/Greeting_Sequences_and_Conversational_Chains.md.
export type Move = 'greeting' | 'howAreYou' | 'thanks' | 'trouble' | 'goodNews' | 'farewell';
export const PACKS = ['chinese', 'korean', 'arabic', 'yoruba', 'hebrew', 'hawaiian'] as const;
export type Pack = (typeof PACKS)[number];

// Checked in this order: a message that thanks and says goodbye gets the thanks answered.
const MOVES: [Move, RegExp][] = [
  ['trouble', /\b(pray(ers?)? for|please pray|struggl\w*|surgery|hospital|diagnos\w*|sick|scared|afraid|worried|anxious|hurting|lost (my|our) |grie\w*|depress\w*|lonely|can't cope|hard time|rough (day|week))\b/i],
  ['goodNews', /\b(good news|great news|answered|got the job|healed|cancer[- ]free|it worked|praise (god|the lord)|thank god|we did it|so happy|engaged|the baby (is|was) born)\b/i],
  ['thanks', /\b(thanks|thank you|thx|ty|grateful|appreciate)\b/i],
  ['howAreYou', /\b(how are (you|u)|how're you|how have you been|how('s| is) it going|how are things)\b/i],
  ['farewell', /\b(bye|goodbye|good night|goodnight|talk (soon|later)|see (you|ya)|gotta go|take care)\b/i],
  ['greeting', /^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening)|greetings|peace be with you|shalom|aloha|blessings)\b/i],
];

/** The kind of move a message makes, or null when no single reply fits. */
export function moveOf(text: string | null | undefined): Move | null {
  if (!text?.trim()) return null;
  for (const [move, re] of MOVES) if (re.test(text)) return move;
  return null;
}

const KEY: Record<Move, string> = {
  greeting: 'talk.suggestGreeting',
  howAreYou: 'talk.suggestHowAreYou',
  thanks: 'talk.suggestThanks',
  trouble: 'talk.suggestTrouble',
  goodNews: 'talk.suggestGoodNews',
  farewell: 'talk.suggestFarewell',
};

/** The locale key of the one reply that fits, or null. */
export function suggestionKey(lastFromOther: string | null, empty: boolean): string | null {
  const move = empty ? 'greeting' : moveOf(lastFromOther);
  return move ? KEY[move] : null;
}

// A short, downbeat answer, the kind that often comes before a trouble is told
// (Heritage 1998 on "oh"-prefaced answers to "how are you"; Jefferson on troubles talk).
const DOWNBEAT =
  /^\s*(oh+|eh|meh|well|hmm+|ugh)\b[\s,.…]|\b(okay i guess|ok i guess|fine i guess|not (great|good|so good|too good)|could be better|been better|hanging in( there)?|so-so|not really|i don't know|idk|tired|exhausted|rough)\b/i;

export function isDownbeat(text: string | null | undefined) {
  return !!text && text.length <= 200 && DOWNBEAT.test(text);
}

export const CLOSING_KEYS = ['talk.closing1', 'talk.closing2'] as const;
