import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as meanings from '../meaning-reactions/index.js';
import * as helpers from './index.js';

export function conversationHelperRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/conversation-prefs', async (req) => ({ prefs: await helpers.prefs(db, requireUser(req)) }));
  app.patch('/me/conversation-prefs', async (req) => ({ prefs: await helpers.updatePrefs(db, requireUser(req), helpers.PrefsPatch.parse(req.body)) }));

  // My meaning words: the whole tree (to choose from) and the member's choices.
  app.get('/me/meaning-words', async (req) => {
    const userId = requireUser(req);
    return { emoji: await meanings.tree(db), prefs: await helpers.meaningPrefs(db, userId) };
  });
  app.put('/me/meaning-words', async (req) => ({ prefs: await helpers.setMeaningPref(db, requireUser(req), helpers.MeaningPref.parse(req.body)) }));
}
