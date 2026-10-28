-- Vine feed 2.0 (beta). Scripture leaves between the fruit ("abide in the
-- vine"), and the vine's look in theme tokens so it can be restyled without
-- an app release. Verses are King James Version (public domain); staff can
-- add or retire leaves from the admin API.

insert into public.scripture_leaves (community_id, reference, text, translation)
select public.default_community_id(), v.reference, v.text, 'KJV'
  from (values
    ('John 15:5', 'I am the vine, ye are the branches: He that abideth in me, and I in him, the same bringeth forth much fruit: for without me ye can do nothing.'),
    ('John 15:4', 'Abide in me, and I in you. As the branch cannot bear fruit of itself, except it abide in the vine; no more can ye, except ye abide in me.'),
    ('1 Thessalonians 5:17', 'Pray without ceasing.'),
    ('Galatians 6:2', 'Bear ye one another''s burdens, and so fulfil the law of Christ.'),
    ('Philippians 4:6', 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.'),
    ('James 5:16', 'Pray one for another, that ye may be healed. The effectual fervent prayer of a righteous man availeth much.'),
    ('Galatians 5:22–23', 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, meekness, temperance: against such there is no law.')
  ) as v(reference, text)
 where not exists (select 1 from public.scripture_leaves);

-- Default look and timing for Vine 2.0; any key can be changed per theme.
update public.feed_themes
   set tokens = tokens || '{
     "stem": "#6E8B4E", "leaf": "#A9C08A", "leafSoft": "#EEF3E6", "branch": "#8A6E4B", "tendril": "#5B3E96",
     "leafEvery": 4, "idleBirdSeconds": 25, "birdText": "Uh-uh! No ads here. Just people and prayer.",
     "tipText": "You have reached the tip of the vine. Rest a moment, or come back later to see it grow."
   }'::jsonb,
       animations = animations || '{"idleBird": true}'::jsonb
 where slug = 'vine';
