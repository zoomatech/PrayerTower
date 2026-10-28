import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set worldwide_count_enabled = true, thanks_card_enabled = true, sermon_inputs_enabled = true, support_label_enabled = true');
  await db.end();
});

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('notebook ideas', () => {
  it('counts prayers worldwide and the people who prayed for you, anonymously', async () => {
    const poster = await createUser('Counted Carla');
    const a = await createUser('Pray-er A');
    const b = await createUser('Pray-er B');
    const before = (await as(poster).get('/stats/worldwide')).json().stats;
    expect(before).toMatchObject({ enabled: true, peoplePrayedForYou: 0 });
    const post = await newRequest(poster);
    await as(poster).post(`/posts/${post.id}/praying-now`, {});
    await as(a).post(`/posts/${post.id}/praying-now`, {});
    await as(b).post(`/posts/${post.id}/praying-now`, {});
    const after = (await as(poster).get('/stats/worldwide')).json().stats;
    expect(after.peoplePrayedForYou).toBe(2); // praying for your own request doesn't count
    expect(after.prayersToday).toBeGreaterThanOrEqual(before.prayersToday + 3);
    expect(after.prayersAllTime).toBeGreaterThanOrEqual(after.prayersToday);
    expect(JSON.stringify(after)).not.toContain('Pray-er');

    const admin = await createUser('Switch Admin');
    await grantRole(db, admin, 'admin', null);
    expect((await as(a).patch('/admin/notebook-settings', { worldwideCountEnabled: false })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/notebook-settings', { worldwideCountEnabled: false })).json().settings.worldwide_count_enabled).toBe(false);
    expect((await as(poster).get('/stats/worldwide')).json().stats).toEqual({ enabled: false });
    expect((await as(poster).get('/features')).json().features.worldwideCount).toBe(false);
    await as(admin).patch('/admin/notebook-settings', { worldwideCountEnabled: true });
  });

  it('shows the thanksgiving card until you post a praise or dismiss it', async () => {
    const me = await createUser('Thankful Theo');
    const friend = await createUser('Answered Ann');
    const req = await newRequest(friend, 'Pray my job interview goes well.');
    await as(me).post(`/posts/${req.id}/praying-now`, {});
    await as(friend).post(`/posts/${req.id}/answered`, {});
    // The pray-er hears the good news even without a testimony.
    const notice = (await as(me).get('/me/notifications')).json().notifications.find((n: { kind: string }) => n.kind === 'answered');
    expect(notice).toMatchObject({ title: 'A prayer you prayed was answered' });
    expect(notice.body).toContain('Answered Ann');

    expect((await as(me).get('/me/thanks-card')).json().card).toEqual({ show: true, answeredYouPrayedFor: 1 });
    await as(me).post('/me/thanks-card/dismiss');
    expect((await as(me).get('/me/thanks-card')).json().card.show).toBe(false);

    const other = await createUser('Praising Pat');
    expect((await as(other).get('/me/thanks-card')).json().card.show).toBe(true);
    await newRequest(other, 'Thank you Lord for a safe trip home!', { postType: 'praise' });
    expect((await as(other).get('/me/thanks-card')).json().card.show).toBe(false);
  });

  it('labels posts that welcome prayer and positive thoughts from anyone', async () => {
    const me = await createUser('Open Olive');
    const post = await newRequest(me, 'My mom starts chemo Monday.', { allSupportWelcome: true });
    expect((await as(me).get(`/posts/${post.id}`)).json().post.allSupportWelcome).toBe(true);
    const plain = await newRequest(me, 'Pray for my week.');
    expect((await as(me).get(`/posts/${plain.id}`)).json().post.allSupportWelcome).toBe(false);
  });

  it('lets people coming to an event send the host what to pray about or preach on', async () => {
    const host = await createUser('Pastor Host');
    const guest = await createUser('Guest Gail');
    const stranger = await createUser('Stranger Sam');
    const { event } = (await as(host).post('/events', { title: 'Sunday service', kind: 'seminar', location: 'Chapel', startsAt: inHours(48) })).json();

    expect((await as(guest).post(`/events/${event.id}/inputs`, { body: 'Please preach on forgiveness.' })).statusCode).toBe(403); // RSVP first
    await as(guest).put(`/events/${event.id}/rsvp`, { status: 'going' });
    const sent = await as(guest).post(`/events/${event.id}/inputs`, { body: 'Please preach on forgiveness.' });
    expect(sent.statusCode).toBe(201);
    expect(sent.json().input.crisis).toBe(false);
    await as(stranger).put(`/events/${event.id}/rsvp`, { status: 'maybe' });
    await as(stranger).post(`/events/${event.id}/inputs`, { body: 'Pray for the drought.' });

    const hostView = (await as(host).get(`/events/${event.id}/inputs`)).json();
    expect(hostView.canSeeAll).toBe(true);
    expect(hostView.inputs.map((i: { body: string }) => i.body)).toEqual(['Please preach on forgiveness.', 'Pray for the drought.']);
    expect(hostView.inputs[0].from.name).toBe('Guest Gail');
    const guestView = (await as(guest).get(`/events/${event.id}/inputs`)).json();
    expect(guestView).toMatchObject({ canSeeAll: false });
    expect(guestView.inputs).toHaveLength(1);

    // The guest can't remove someone else's note; the host can.
    const strangerNote = hostView.inputs[1].id;
    expect((await as(guest).delete(`/events/${event.id}/inputs/${strangerNote}`)).statusCode).toBe(404);
    expect((await as(host).delete(`/events/${event.id}/inputs/${strangerNote}`)).statusCode).toBe(200);
    expect((await as(host).get(`/events/${event.id}/inputs`)).json().inputs).toHaveLength(1);

    await db.query('update public.notebook_settings set sermon_inputs_enabled = false');
    expect((await as(guest).post(`/events/${event.id}/inputs`, { body: 'One more.' })).statusCode).toBe(403);
    await db.query('update public.notebook_settings set sermon_inputs_enabled = true');
  });
});
