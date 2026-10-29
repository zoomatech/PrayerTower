-- Anonymous, opt-in counts of how talk unfolds (docs/CONVERSATION_HELPERS.md, "Counting
-- patterns"). The greeting research found no published counts of greeting → reply →
-- follow-up chains, nor of emoji used as a reply (research/Greeting_Sequences_and_
-- Conversational_Chains.md, "Thin coverage"). Off until an admin turns it on, and then
-- only for members who choose to share. The phone works out the kind of move; the
-- server keeps weekly totals of move labels only: no words, no member, no conversation.
alter table public.conversation_settings add column talk_counts_enabled boolean not null default false;
alter table public.conversation_prefs add column share_counts boolean not null default false;

create table public.talk_chain_counts (
  week date not null,
  first_move text not null check (first_move in ('greeting', 'howAreYou', 'thanks', 'trouble', 'goodNews', 'farewell')),
  reply_move text not null check (reply_move in ('greeting', 'howAreYou', 'thanks', 'trouble', 'goodNews', 'farewell', 'other')),
  followup_move text not null check (followup_move in ('greeting', 'howAreYou', 'thanks', 'trouble', 'goodNews', 'farewell', 'other')),
  n integer not null default 0,
  primary key (week, first_move, reply_move, followup_move)
);
alter table public.talk_chain_counts enable row level security;

create table public.emoji_reply_counts (
  week date not null,
  emoji_key text not null check (length(emoji_key) between 1 and 30),
  meaning_key text not null check (length(meaning_key) between 1 and 40),
  to_move text not null check (to_move in ('greeting', 'howAreYou', 'thanks', 'trouble', 'goodNews', 'farewell', 'other')),
  n integer not null default 0,
  primary key (week, emoji_key, meaning_key, to_move)
);
alter table public.emoji_reply_counts enable row level security;

-- A daily cap per member so no one can skew the totals. Kept apart from the counts,
-- and only for today and yesterday.
create table public.talk_count_quota (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default current_date,
  n integer not null default 0,
  primary key (user_id, day)
);
alter table public.talk_count_quota enable row level security;
