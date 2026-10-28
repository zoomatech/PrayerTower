// Surveys and podcasts (both off or drafts by default): a member answers an open
// survey from the feed, and listens to a podcast from Me.
import { expect, test } from '@playwright/test';
import { db, signIn, unique } from './helpers';

test('a member answers an open survey once', async ({ page }) => {
  const title = unique('How are we doing');
  const { rows } = await db.query<{ id: string }>(`insert into public.surveys (title, intro, status, opened_at) values ($1, 'Two quick questions.', 'open', now()) returning id`, [title]);
  const id = rows[0]!.id;
  await db.query(
    `insert into public.survey_questions (survey_id, position, kind, prompt, options, required) values
       ($1, 1, 'single', 'Do you feel welcome here?', '{Yes,No}', true),
       ($1, 2, 'scale', 'How safe do you feel sharing?', '{"Not safe","Very safe"}', false)`,
    [id],
  );
  try {
    await signIn(page, 'carol');
    await expect(page.getByText(`A short survey: ${title}`)).toBeVisible();
    await page.getByRole('button', { name: 'Take the survey' }).first().click();
    await expect(page.getByText('Your answers are anonymous. We only ever see totals.')).toBeVisible();
    await page.getByRole('radio', { name: 'Yes' }).click();
    await page.getByRole('radio', { name: '4' }).click();
    await page.getByRole('button', { name: 'Send my answers' }).click();
    await expect(page.getByText('Thank you. Your answers were sent.')).toBeVisible();
    const { rows: r } = await db.query('select user_id from public.survey_responses where survey_id = $1', [id]);
    expect(r).toEqual([{ user_id: null }]);
  } finally {
    await db.query('delete from public.surveys where id = $1', [id]);
  }
});

test('a member finds podcasts on Me while they are switched on', async ({ page }) => {
  const slug = `e2e-${Date.now().toString(36)}`;
  await db.query('update public.notebook_settings set podcasts_enabled = true');
  const { rows } = await db.query<{ id: string }>(
    `insert into public.podcast_shows (slug, title, description, author, published) values ($1, 'Morning Prayer', 'Ten minutes to start the day.', 'Prayer Tower', true) returning id`,
    [slug],
  );
  await db.query(`insert into public.podcast_episodes (show_id, title, audio_url, audio_bytes, duration_seconds, published_at) values ($1, 'Day 1: Be still', 'https://example.com/ep1.mp3', 1000, 600, now())`, [rows[0]!.id]);
  try {
    await signIn(page, 'carol');
    await page.goto('/podcasts');
    await expect(page.getByText('Morning Prayer', { exact: true })).toBeVisible();
    await expect(page.getByText('Day 1: Be still', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play Day 1: Be still' })).toBeVisible();
    const feed = await page.request.get(`http://127.0.0.1:3000/podcasts/${slug}/feed.xml`);
    expect(feed.status()).toBe(200);
    expect(await feed.text()).toContain('<enclosure url="https://example.com/ep1.mp3" length="1000" type="audio/mpeg"/>');
  } finally {
    await db.query('delete from public.podcast_shows where id = $1', [rows[0]!.id]);
    await db.query('update public.notebook_settings set podcasts_enabled = false');
  }
});
