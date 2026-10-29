import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { notFound } from '../../errors.js';
import * as meanings from '../meaning-reactions/index.js';
import * as counts from './counts.js';
import * as helpers from './index.js';

export function conversationHelperRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/conversation-prefs', async (req) => ({ prefs: await helpers.prefs(db, requireUser(req)) }));
  app.patch('/me/conversation-prefs', async (req) => ({ prefs: await helpers.updatePrefs(db, requireUser(req), helpers.PrefsPatch.parse(req.body)) }));

  // Counting patterns: move labels only, from members who chose to share.
  app.post('/talk-counts', async (req) => counts.record(db, requireUser(req), counts.Count.parse(req.body)));
  // The members' kindness research page: the same anonymous totals the admin sees.
  app.get('/kindness-research', async (req) => {
    requireUser(req);
    if (!(await helpers.settings(db)).research_page_enabled) throw notFound('Page');
    return { counts: await counts.summary(db) };
  });

  // My meaning words: the whole tree (to choose from) and the member's choices.
  app.get('/me/meaning-words', async (req) => {
    const userId = requireUser(req);
    return { emoji: await meanings.tree(db), prefs: await helpers.meaningPrefs(db, userId) };
  });
  app.put('/me/meaning-words', async (req) => ({ prefs: await helpers.setMeaningPref(db, requireUser(req), helpers.MeaningPref.parse(req.body)) }));
}
