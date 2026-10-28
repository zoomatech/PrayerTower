-- Security review (pilot): token_pool_account was still executable by the
-- Data API's client roles. Revoke again for every function in public; only
-- the API server (postgres) calls them.
revoke execute on all functions in schema public from public, anon, authenticated;
