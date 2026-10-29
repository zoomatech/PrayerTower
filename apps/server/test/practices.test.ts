// Growth practices: the once-only "share how it's going?" follow-up, the private
// weekly gratitude card, and the gentle rhythm numbers. Each is off by default.
import type { JobHelpers } from "graphile-worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as notebook from "../src/modules/notebook/index.js";
import * as practices from "../src/modules/practices/index.js";
import { rhythm } from "../src/modules/prayer-stats/index.js";
import { as, createUser, db, newRequest } from "./helpers.js";

const set = (followup: boolean, gratitude: boolean, rhythmOn = false) =>
  db.query(
    "update public.practice_settings set followup_enabled = $1, gratitude_enabled = $2, gentle_rhythm_enabled = $3, followup_days = 21",
    [followup, gratitude, rhythmOn],
  );
const run = (task: ReturnType<typeof practices.followupDueTask>) =>
  task({}, {} as JobHelpers);
const notices = async (userId: string, kind: string) =>
  (
    await db.query<{ body: string; data: { postId?: string } }>(
      "select body, data from public.notifications where user_id = $1 and kind = $2",
      [userId, kind],
    )
  ).rows;

/** A request that someone else prayed for, posted `days` ago. */
async function prayedRequest(
  poster: string,
  prayer: string,
  days: number,
  body?: string,
) {
  const post = await newRequest(poster, body);
  await db.query(
    `insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`,
    [post.id, prayer],
  );
  await db.query(
    `update public.posts set created_at = now() - make_interval(days => $2) where id = $1`,
    [post.id, days],
  );
  return post;
}

beforeAll(() => set(false, false));
afterAll(async () => {
  await set(false, false);
  await db.end();
});

describe("Follow-up", () => {
  it("does nothing while off", async () => {
    expect((await notebook.features(db)).followupNudge).toBe(false);
    const [poster, prayer] = [
      await createUser("Follow Off"),
      await createUser("Follow Off Prayer"),
    ];
    const post = await prayedRequest(poster, prayer, 22);
    await run(practices.followupDueTask(db));
    expect(await notices(poster, "followup")).toEqual([]);
    expect((await as(poster).get(`/posts/${post.id}/followup`)).json()).toEqual(
      { enabled: false, pending: false },
    );
  });

  it("asks the author once, only for prayed-for requests past the set days", async () => {
    await set(true, false);
    const [poster, prayer] = [
      await createUser("Follow Poster"),
      await createUser("Follow Prayer"),
    ];
    const due = await prayedRequest(poster, prayer, 22);
    const tooNew = await prayedRequest(poster, prayer, 5);
    const unprayed = await newRequest(poster);
    await db.query(
      `update public.posts set created_at = now() - interval '22 days' where id = $1`,
      [unprayed.id],
    );
    await run(practices.followupDueTask(db));
    await run(practices.followupDueTask(db));
    const asked = await notices(poster, "followup");
    expect(asked.map((n) => n.data.postId)).toEqual([due.id]);
    expect(asked[0]!.body).toContain("1 person prayed for your request");
    expect((await as(poster).get(`/posts/${due.id}/followup`)).json()).toEqual({
      enabled: true,
      pending: true,
    });
    expect(
      (await as(poster).get(`/posts/${tooNew.id}/followup`)).json().pending,
    ).toBe(false);
    expect(
      (await as(prayer).get(`/posts/${due.id}/followup`)).json().pending,
    ).toBe(false);
  });

  it("a grateful update marks it answered and uses the one existing testimony notice", async () => {
    await set(true, false);
    const [poster, prayer, other] = [
      await createUser("Grateful Poster"),
      await createUser("Grateful Prayer"),
      await createUser("Grateful Other"),
    ];
    const post = await prayedRequest(poster, prayer, 22);
    await run(practices.followupDueTask(db));
    expect(
      (
        await as(other).post(`/posts/${post.id}/followup`, {
          answer: "grateful",
        })
      ).statusCode,
    ).toBe(403);
    const res = await as(poster).post(`/posts/${post.id}/followup`, {
      answer: "grateful",
      body: "The surgery went well.",
    });
    expect(res.statusCode).toBe(200);
    expect(
      (
        await db.query("select state from public.posts where id = $1", [
          post.id,
        ])
      ).rows[0].state,
    ).toBe("answered");
    expect((await notices(prayer, "testimony")).map((n) => n.body)).toEqual([
      expect.stringContaining("The surgery went well."),
    ]);
    expect(await notices(prayer, "followup_update")).toEqual([]);
    expect(
      (await as(poster).post(`/posts/${post.id}/followup`, { answer: "still" }))
        .statusCode,
    ).toBe(400);
  });

  it('"still in it" with words posts an update and tells the pray-ers once; "prefer not to say" stays quiet', async () => {
    await set(true, false);
    const [poster, prayer] = [
      await createUser("Still Poster"),
      await createUser("Still Prayer"),
    ];
    const still = await prayedRequest(
      poster,
      prayer,
      23,
      "Please pray for my job search.",
    );
    const quiet = await prayedRequest(
      poster,
      prayer,
      23,
      "Please pray for my brother.",
    );
    await run(practices.followupDueTask(db));
    expect(
      (
        await as(poster).post(`/posts/${still.id}/followup`, {
          answer: "still",
          body: "Two interviews next week.",
        })
      ).statusCode,
    ).toBe(200);
    const { rows } = await db.query(
      "select body, is_update from public.comments where post_id = $1",
      [still.id],
    );
    expect(rows).toEqual([
      { body: "Two interviews next week.", is_update: true },
    ]);
    expect((await notices(prayer, "followup_update")).length).toBe(1);
    expect(
      (
        await as(poster).post(`/posts/${quiet.id}/followup`, {
          answer: "private",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.comments where post_id = $1",
          [quiet.id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query(`select state from public.posts where id = $1`, [
          quiet.id,
        ])
      ).rows[0].state,
    ).not.toBe("answered");
    expect((await notices(prayer, "followup_update")).length).toBe(1);
  });
});

describe("Gratitude card", () => {
  it("is refused while off", async () => {
    await set(false, false);
    const u = await createUser("Grat Off");
    expect((await as(u).get("/me/gratitude")).json()).toEqual({
      enabled: false,
    });
    expect(
      (
        await as(u).put("/me/gratitude", {
          items: ["Sunshine"],
          timeZone: "UTC",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("keeps one private card a week, and the chosen day", async () => {
    await set(false, true);
    const u = await createUser("Grat On");
    let g = (
      await as(u).put("/me/gratitude/day", {
        weekday: 5,
        timeZone: "America/Chicago",
      })
    ).json();
    expect(g.weekday).toBe(5);
    g = (
      await as(u).put("/me/gratitude", {
        items: ["A long walk", "", "Soup from Carol"],
        timeZone: "America/Chicago",
      })
    ).json();
    expect(g.items).toEqual(["A long walk", "Soup from Carol"]);
    g = (
      await as(u).put("/me/gratitude", {
        items: ["A long walk", "Soup from Carol", "Sleep"],
        timeZone: "America/Chicago",
      })
    ).json();
    expect(g.items).toHaveLength(3);
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.gratitude_entries where user_id = $1",
          [u],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await as(u).put("/me/gratitude/day", { weekday: null, timeZone: "UTC" })
      ).json().weekday,
    ).toBeNull();
  });

  it("invites at 6 pm on the chosen day, only when the card is empty, never twice", async () => {
    await set(false, true);
    // A whole-hour time zone where it is 6 pm right now.
    const offset =
      ((((18 - new Date().getUTCHours() + 12) % 24) + 24) % 24) - 12;
    const tz = offset >= 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
    const { rows } = await db.query<{ dow: number }>(
      "select extract(dow from now() at time zone $1)::int as dow",
      [tz],
    );
    const [empty, filled] = [
      await createUser("Grat Empty"),
      await createUser("Grat Filled"),
    ];
    for (const u of [empty, filled])
      await as(u).put("/me/gratitude/day", {
        weekday: rows[0]!.dow,
        timeZone: tz,
      });
    await as(filled).put("/me/gratitude", {
      items: ["Done already"],
      timeZone: tz,
    });
    await run(practices.gratitudeDueTask(db));
    await run(practices.gratitudeDueTask(db));
    expect((await notices(empty, "gratitude")).length).toBe(1);
    expect(await notices(filled, "gratitude")).toEqual([]);
  });
});

describe("Gentle rhythm", () => {
  it("counts days this month, welcomes back after a week away, and marks fresh starts", () => {
    expect(
      rhythm(["2026-09-30", "2026-10-02", "2026-10-03"], "2026-10-05"),
    ).toEqual({ monthDays: 2, welcomeBack: false, freshStart: "week" });
    expect(rhythm(["2026-10-10", "2026-10-20"], "2026-10-20")).toEqual({
      monthDays: 2,
      welcomeBack: true,
      freshStart: null,
    });
    expect(rhythm([], "2026-11-01")).toEqual({
      monthDays: 0,
      welcomeBack: false,
      freshStart: "month",
    });
  });

  it("is a switch the app reads", async () => {
    await set(false, false, true);
    expect((await notebook.features(db)).gentleRhythm).toBe(true);
    await set(false, false, false);
  });
});
