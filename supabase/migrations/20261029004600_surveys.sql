-- Member surveys (Notes p2: "Should there be a survey identifying pro-gay or
-- other mistreated Christians from people who will either refuse to pray for
-- them, or abuse them, or attempt to convert them?"). A general tool: admins
-- write a survey, and members see it only after an admin opens it. Nothing is
-- open by default. Anonymous surveys keep who answered apart from what they
-- answered, and results show only totals.
create type public.survey_status as enum ('draft', 'open', 'closed');
create type public.survey_question_kind as enum ('single', 'multi', 'scale', 'text');

create table public.surveys (
  id uuid primary key default public.uuid_v7(),
  title text not null check (char_length(title) between 1 and 120),
  intro text check (intro is null or char_length(intro) <= 1000),
  status public.survey_status not null default 'draft',
  -- Anonymous: answers are stored without the member's id.
  anonymous boolean not null default true,
  -- Only members of this community see it (null: everyone).
  community_id uuid references public.communities (id) on delete cascade,
  closes_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger surveys_touch before update on public.surveys for each row execute function public.touch_updated_at();
alter table public.surveys enable row level security;

create table public.survey_questions (
  id uuid primary key default public.uuid_v7(),
  survey_id uuid not null references public.surveys (id) on delete cascade,
  position int not null,
  kind public.survey_question_kind not null,
  prompt text not null check (char_length(prompt) between 1 and 300),
  -- Choices for single and multi; for scale, the two end labels.
  options text[] not null default '{}',
  required boolean not null default false,
  unique (survey_id, position)
);
alter table public.survey_questions enable row level security;

-- Who has answered (so each member answers once), kept apart from the answers.
create table public.survey_respondents (
  survey_id uuid not null references public.surveys (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answered_at timestamptz not null default now(),
  primary key (survey_id, user_id)
);
alter table public.survey_respondents enable row level security;

create table public.survey_responses (
  id uuid primary key default public.uuid_v7(),
  survey_id uuid not null references public.surveys (id) on delete cascade,
  -- Null on anonymous surveys.
  user_id uuid references public.profiles (id) on delete cascade,
  -- Day only, so an anonymous response can't be matched to a respondent's exact time.
  answered_on date not null default current_date
);
create index survey_responses_survey on public.survey_responses (survey_id);
alter table public.survey_responses enable row level security;

create table public.survey_answers (
  response_id uuid not null references public.survey_responses (id) on delete cascade,
  question_id uuid not null references public.survey_questions (id) on delete cascade,
  choices text[] not null default '{}',
  value int,
  text_answer text check (text_answer is null or char_length(text_answer) <= 2000),
  primary key (response_id, question_id)
);
alter table public.survey_answers enable row level security;

-- The draft from the notebook, for Steve to edit, open or delete. It stays a draft until an admin opens it.
with s as (
  insert into public.surveys (title, intro, community_id)
  values (
    'Praying for everyone',
    'Help us keep Prayer Tower a place where every Christian is prayed for and treated with respect. Your answers are anonymous, and we only ever see totals.',
    public.default_community_id()
  ) returning id
)
insert into public.survey_questions (survey_id, position, kind, prompt, options, required)
select s.id, q.position, q.kind::public.survey_question_kind, q.prompt, q.options, q.required from s, (values
  (1, 'single', 'Have you ever been refused prayer, mocked or pressured to change by other Christians because of who you are?', '{Yes,No,"Prefer not to say"}'::text[], true),
  (2, 'multi', 'If so, because of what? Choose any that apply.', '{"My denomination","My sexuality or gender","My race or culture","My politics","My past","Something else"}'::text[], false),
  (3, 'single', 'Would you pray for a request from any Christian who asked, whoever they are?', '{Yes,"Sometimes","No","Not sure"}'::text[], true),
  (4, 'scale', 'How safe do you feel sharing your own requests here?', '{"Not safe","Very safe"}'::text[], false),
  (5, 'text', 'Anything you would like us to know? (optional)', '{}'::text[], false)
) as q(position, kind, prompt, options, required);
