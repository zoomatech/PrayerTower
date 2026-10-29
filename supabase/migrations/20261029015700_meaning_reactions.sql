-- Emoji reactions that say something (Steve, 2026-10-29): a tap on an emoji adds
-- its first meaning as a "leaf" on the post; a long-press opens up to five
-- positive meanings ("💪 Feel better", "💪 Praying for healing"). Research:
-- research/Emoji_Reaction_Tree_Research.md (Unicode CLDR keeps keywords under 5
-- per emoji; "delicious" belongs to 😋, not ❤️). Off by default.
alter table public.notebook_settings
  add column meaning_reactions_enabled boolean not null default false;

-- The tree is data, so staff can retire a meaning nobody uses (as Facebook and
-- LinkedIn did) or change wording without an app release.
create table public.reaction_meanings (
  emoji_key text not null,
  emoji text not null,
  meaning_key text not null,
  position smallint not null check (position between 1 and 5),
  faith_label text not null check (char_length(faith_label) between 1 and 40),
  neutral_label text not null check (char_length(neutral_label) between 1 and 40),
  enabled boolean not null default true,
  primary key (emoji_key, meaning_key),
  unique (emoji_key, position)
);
alter table public.reaction_meanings enable row level security;

insert into public.reaction_meanings (emoji_key, emoji, meaning_key, position, faith_label, neutral_label) values
  ('praying', '🙏', 'praying_for_you', 1, 'Praying for you', 'Thinking of you'),
  ('praying', '🙏', 'amen', 2, 'Amen', 'Yes, this'),
  ('praying', '🙏', 'blessings', 3, 'Blessings to you', 'Wishing you well'),
  ('praying', '🙏', 'thank_you', 4, 'Thank you', 'Thank you'),
  ('praying', '🙏', 'grateful_with_you', 5, 'Grateful with you', 'Grateful with you'),
  ('love', '❤️', 'love_this', 1, 'Love this', 'Love this'),
  ('love', '❤️', 'sending_love', 2, 'Sending love', 'Sending love'),
  ('love', '❤️', 'you_are_loved', 3, 'You are loved', 'You matter'),
  ('love', '❤️', 'gods_love', 4, 'God''s love to you', 'So much love'),
  ('love', '❤️', 'beautiful', 5, 'Beautiful', 'Beautiful'),
  ('support', '🫂', 'hugs', 1, 'Sending hugs', 'Sending hugs'),
  ('support', '🫂', 'here_for_you', 2, 'I''m here for you', 'I''m here for you'),
  ('support', '🫂', 'not_alone', 3, 'You''re not alone', 'You''re not alone'),
  ('support', '🫂', 'so_sorry', 4, 'So sorry', 'So sorry'),
  ('support', '🫂', 'comfort', 5, 'Praying for comfort', 'Sending comfort'),
  ('strength', '💪', 'feel_better', 1, 'Feel better', 'Feel better'),
  ('strength', '💪', 'healing', 2, 'Praying for healing', 'Get well soon'),
  ('strength', '💪', 'stay_strong', 3, 'Stay strong', 'Stay strong'),
  ('strength', '💪', 'got_this', 4, 'You''ve got this', 'You''ve got this'),
  ('strength', '💪', 'strength_today', 5, 'Strength for today', 'One day at a time'),
  ('celebrate', '🎉', 'so_happy', 1, 'So happy for you', 'So happy for you'),
  ('celebrate', '🎉', 'congratulations', 2, 'Congratulations!', 'Congratulations!'),
  ('celebrate', '🎉', 'answered', 3, 'Answered prayer!', 'Wonderful news!'),
  ('celebrate', '🎉', 'praise', 4, 'Praise God!', 'Woohoo!'),
  ('celebrate', '🎉', 'well_deserved', 5, 'Well deserved', 'Well deserved'),
  ('remember', '🕯️', 'holding_you', 1, 'Holding you in prayer', 'Holding you in my thoughts'),
  ('remember', '🕯️', 'loving_memory', 2, 'In loving memory', 'In loving memory'),
  ('remember', '🕯️', 'rest_in_peace', 3, 'Rest in peace', 'Remembering with you'),
  ('remember', '🕯️', 'peace', 4, 'Peace be with you', 'Wishing you peace'),
  ('remember', '🕯️', 'light', 5, 'A light for you', 'A light for you');

-- One meaning per emoji per member per post: choosing another meaning of the same emoji replaces it.
create table public.meaning_reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji_key text not null,
  meaning_key text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji_key),
  foreign key (emoji_key, meaning_key) references public.reaction_meanings (emoji_key, meaning_key)
);
create index meaning_reactions_user_idx on public.meaning_reactions (user_id);
alter table public.meaning_reactions enable row level security;
