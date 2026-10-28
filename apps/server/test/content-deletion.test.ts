import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { app, as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('deleting your own content', () => {
  it('lets the poster delete a request, and nobody else', async () => {
    const poster = await createUser('Deleting Dora');
    const other = await createUser('Other Otto');
    const post = await newRequest(poster, 'Pray for my test results.');
    expect((await as(other).delete(`/posts/${post.id}`)).statusCode).toBe(404);
    expect((await as(poster).delete(`/posts/${post.id}`)).json()).toEqual({ deleted: true });
    expect((await as(other).get(`/posts/${post.id}`)).statusCode).toBe(404);
    expect((await db.query('select 1 from public.posts where id = $1', [post.id])).rowCount).toBe(0);
  });

  it('empties a request that holds tokens instead of erasing it', async () => {
    const poster = await createUser('Funded Fay');
    const post = await newRequest(poster, 'Pray for our food pantry.');
    await db.query(`insert into public.token_accounts (kind, post_id) values ('post_reach', $1)`, [post.id]);
    await as(poster).delete(`/posts/${post.id}`);
    const { rows } = await db.query('select body, moderation_status from public.posts where id = $1', [post.id]);
    expect(rows[0]).toEqual({ body: '(deleted)', moderation_status: 'removed' });
  });

  it('lets the author delete a comment; a comment with replies keeps its place', async () => {
    const poster = await createUser('Comment Poster');
    const author = await createUser('Comment Author');
    const post = await newRequest(poster, 'Pray for my sister.');
    const lone = (await as(author).post(`/posts/${post.id}/comments`, { body: 'Praying now.' })).json().comment.id as string;
    const parent = (await as(author).post(`/posts/${post.id}/comments`, { body: 'Praying for her healing.' })).json().comment.id as string;
    await as(poster).post(`/posts/${post.id}/comments`, { body: 'Thank you!', parentId: parent });

    expect((await as(poster).delete(`/comments/${lone}`)).statusCode).toBe(404);
    await as(author).delete(`/comments/${lone}`);
    await as(author).delete(`/comments/${parent}`);
    const comments = (await as(poster).get(`/posts/${post.id}/comments`)).json().comments as { id: string; body: string; isMine: boolean }[];
    expect(comments.find((c) => c.id === lone)).toBeUndefined();
    expect(comments.find((c) => c.id === parent)?.body).toBe('(deleted)');
    expect(comments.find((c) => c.body === 'Thank you!')?.isMine).toBe(true);
  });
});

describe('account deletion web page', () => {
  it('serves the page without sign-in and takes requests that staff can carry out', async () => {
    const page = await app.inject({ method: 'GET', url: '/account-deletion' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('Delete your Prayer Tower account');
    expect(page.body).toContain('help@example.com');

    const member = await createUser('Web Deleter');
    const { rows } = await db.query<{ email: string }>('select email from auth.users where id = $1', [member]);
    expect((await app.inject({ method: 'POST', url: '/account-deletion/requests', payload: { email: 'not-an-email' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/account-deletion/requests', payload: { email: rows[0]!.email.toUpperCase(), note: 'Lost my phone' } })).statusCode).toBe(201);

    const admin = await createUser('Deletion Admin');
    await grantRole(db, admin, 'admin', null);
    expect((await as(member).get('/admin/deletion-requests')).statusCode).toBe(403);
    const requests = (await as(admin).get('/admin/deletion-requests')).json().requests as { id: string; email: string; accountFound: boolean }[];
    const mine = requests.find((r) => r.email === rows[0]!.email);
    expect(mine?.accountFound).toBe(true);
    expect((await as(admin).post(`/admin/deletion-requests/${mine!.id}`, { action: 'delete' })).json()).toEqual({ ok: true });
    expect((await db.query('select 1 from auth.users where id = $1', [member])).rowCount).toBe(0);
    expect((await as(admin).post(`/admin/deletion-requests/${mine!.id}`, { action: 'dismiss' })).statusCode).toBe(409);
  });
});
