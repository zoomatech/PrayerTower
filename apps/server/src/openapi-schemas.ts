// Request schemas for the OpenAPI spec, keyed by route. Generated once from the
// `X.parse(req.body)` / `X.parse(req.query)` calls in modules/*/routes.ts;
// openapi.test.ts fails when a key here no longer matches a route.
import type { z } from 'zod';
import * as accounts from './modules/accounts/index.js';
import * as activity from './modules/activity/index.js';
import * as announcements from './modules/announcements/index.js';
import * as care from './modules/care/index.js';
import * as commitments from './modules/commitments/index.js';
import * as deletion from './modules/deletion-page/index.js';
import * as events from './modules/events/index.js';
import * as feedback from './modules/feedback/index.js';
import * as future from './modules/future/index.js';
import * as store from './modules/store/index.js';
import * as invites from './modules/invites/index.js';
import * as inviteEmail from './modules/invites/email.js';
import * as inviteImport from './modules/invites/import.js';
import * as macroNeeds from './modules/macro-needs/index.js';
import * as messages from './modules/messages/index.js';
import * as milestones from './modules/milestones/index.js';
import * as moderation from './modules/moderation/index.js';
import * as pools from './modules/pools/index.js';
import * as posts from './modules/posts/index.js';
import * as prayerActions from './modules/prayer-actions/index.js';
import * as prompts from './modules/prompts/index.js';
import * as reach from './modules/reach/index.js';
import * as schedules from './modules/schedules/index.js';
import * as tiers from './modules/tiers/index.js';
import * as witness from './modules/witness/index.js';

export const REQUEST_SCHEMAS: Record<string, { body?: z.ZodType; query?: z.ZodType }> = {
  'PATCH /me': { body: accounts.ProfileUpdate },
  'PATCH /admin/tiers/:tier': { body: tiers.SettingUpdate },
  'PATCH /admin/reach-settings': { body: reach.SettingsPatch },
  'PATCH /admin/future-settings': { body: future.SettingsPatch },
  'GET /admin/feedback': { query: feedback.Filter },
  'GET /admin/feedback/export': { query: feedback.ExportFilter },
  'PATCH /admin/feedback/:id': { body: feedback.Triage },
  'POST /admin/deletion-requests/:id': { body: deletion.Decision },
  'PATCH /admin/activity-settings': { body: activity.SettingsPatch },
  'PATCH /admin/care-settings': { body: care.SettingsPatch },
  'PATCH /admin/event-settings': { body: events.SettingsPatch },
  'POST /admin/milestones': { body: milestones.RuleInput },
  'POST /admin/announcements': { body: announcements.NewAnnouncement },
  'POST /care-requests': { body: care.NewCareRequest },
  'POST /posts/:id/commitments': { body: commitments.NewCommitment },
  'PATCH /commitments/:id': { body: commitments.Edit },
  'POST /account-deletion/requests': { body: deletion.NewRequest },
  'POST /events': { body: events.NewEvent },
  'POST /feedback': { body: feedback.NewFeedback },
  'POST /token-store/purchases': { body: store.Purchase },
  'POST /ai-chat': { body: future.AiChat },
  'POST /admin/invites': { body: invites.NewInvites },
  'POST /macro-needs': { body: macroNeeds.NewMacroNeed },
  'POST /posts/:id/messages': { body: messages.NewPrayerThread },
  'POST /conversations/direct': { body: messages.NewDirect },
  'POST /conversations/groups': { body: messages.NewGroup },
  'POST /conversations/:id/messages': { body: messages.NewMessage },
  'POST /reports': { body: moderation.Report },
  'POST /moderation/activity-flags/:id': { body: activity.Decision },
  'POST /moderation/items/:id/decision': { body: moderation.Decision },
  'POST /moderation/items/:id/appeal': { body: moderation.NewAppeal },
  'POST /moderation/appeals/:id/decision': { body: moderation.AppealDecision },
  'POST /token-pools': { body: pools.NewPool },
  'POST /posts': { body: posts.NewPost },
  'POST /posts/:id/comments': { body: posts.NewComment },
  'POST /posts/:id/reactions': { body: posts.NewReaction },
  'POST /posts/:id/thanks': { body: posts.NewThanks },
  'POST /posts/:id/ask': { body: posts.AskToPray },
  'POST /posts/:id/praying-now': { body: prayerActions.PrayingNow },
  'POST /me/prompts/:id/response': { body: prompts.Response },
  'POST /posts/:id/scheduled-spends': { body: schedules.NewSchedule },
  'POST /posts/:id/witness': { body: witness.NewCase },
  'POST /witness/cases/:id/notes': { body: witness.NewNote },
  'PATCH /witness/cases/:id': { body: witness.CaseUpdate },
  'POST /admin/invites/:code/email': { body: inviteEmail.EmailInvite },
  'POST /admin/import': { body: inviteImport.ImportInput },
};
