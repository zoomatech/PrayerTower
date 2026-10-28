-- Two notebook items (Notes Page 16), each behind a switch that is off by default:
--   * the "Share your faith freely. Don't pressure people." community rule
--     (docs/policy/PROSELYTIZING_RULE_DRAFT.md): shown on the rules screen and
--     citable by moderators only once an admin turns it on;
--   * the public ad-free promise page (/promise on the website).
alter table public.notebook_settings
  add column pressure_rule_enabled boolean not null default false,
  add column promise_page_enabled boolean not null default false;
