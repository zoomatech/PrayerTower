-- Reply prompts that pair with each kind of post (a request gets "praying for you", good
-- news gets gladness, a lament gets presence). Shown to members who turned on reply
-- suggestions; a tap only fills the box. Off by default.
alter table public.conversation_settings add column type_prompts_enabled boolean not null default false;
