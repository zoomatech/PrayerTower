import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../../auth.js";
import { withTx, type Db } from "../../db.js";
import { validTimeZone } from "../accounts/index.js";
import { markAnsweredAndTell } from "../posts/routes.js";
import * as practices from "./index.js";

type Id = { Params: { id: string } };

export function practiceRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  const tz = z.object({
    tz: z
      .string()
      .max(64)
      .refine(validTimeZone, "Unknown time zone")
      .default("UTC"),
  });

  app.get<Id>("/posts/:id/followup", async (req) => {
    const { id: postId } = id.parse(req.params);
    return practices.followupFor(db, requireUser(req), postId);
  });

  app.post<Id>("/posts/:id/followup", async (req) => {
    const userId = requireUser(req);
    const { id: postId } = id.parse(req.params);
    const input = practices.FollowupAnswer.parse(req.body);
    return withTx(db, (tx) =>
      practices.answerFollowup(tx, userId, postId, input, (t) =>
        markAnsweredAndTell(tx, userId, postId, t),
      ),
    );
  });

  app.get("/me/gratitude", async (req) => {
    const { tz: timeZone } = tz.parse(req.query);
    return practices.gratitude(db, requireUser(req), timeZone);
  });

  app.put("/me/gratitude/day", async (req) => {
    const input = practices.GratitudeDay.parse(req.body);
    if (!validTimeZone(input.timeZone)) input.timeZone = "UTC";
    return practices.setGratitudeDay(db, requireUser(req), input);
  });

  app.put("/me/gratitude", async (req) => {
    const input = practices.GratitudeCard.parse(req.body);
    if (!validTimeZone(input.timeZone)) input.timeZone = "UTC";
    return practices.saveGratitude(db, requireUser(req), input);
  });
}
