-- Verified church pastors (church partner onboarding). Added alone (new enum value).
alter type public.app_role add value if not exists 'pastor';
