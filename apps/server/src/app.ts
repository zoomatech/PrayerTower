import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { makeAuthHook, type TokenVerifier } from './auth.js';
import type { Db } from './db.js';
import { AppError } from './errors.js';
import { adminRoutes } from './modules/admin/routes.js';
import { auditHook } from './modules/audit/index.js';
import { accountRoutes } from './modules/accounts/routes.js';
import { careRoutes } from './modules/care/routes.js';
import { commitmentRoutes } from './modules/commitments/routes.js';
import { feedRoutes } from './modules/feed/routes.js';
import type { Classifier } from './modules/moderation/index.js';
import { harmRoutes } from './modules/harm/routes.js';
import { safetyCenterRoutes } from './modules/safety-center/routes.js';
import { moderationRoutes } from './modules/moderation/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { postRoutes } from './modules/posts/routes.js';
import { promptRoutes } from './modules/prompts/routes.js';
import { tierRoutes } from './modules/tiers/routes.js';
import { prayerActionRoutes } from './modules/prayer-actions/routes.js';
import { radioRoutes } from './modules/radio/routes.js';
import { awardRoutes } from './modules/admin/award-routes.js';
import { spokenPrayerRoutes } from './modules/spoken-prayers/routes.js';
import { communityRoutes } from './modules/communities/routes.js';
import { surveyRoutes } from './modules/surveys/routes.js';
import { quickReactionRoutes } from './modules/quick-reactions/routes.js';
import { meaningReactionRoutes } from './modules/meaning-reactions/routes.js';
import { practiceRoutes } from './modules/practices/routes.js';
import { checkBackRoutes } from './modules/check-back/routes.js';
import { kindMilestoneRoutes } from './modules/kind-milestones/routes.js';
import { commentKindnessRoutes } from './modules/comment-kindness/routes.js';
import { thankNoteRoutes } from './modules/thank-note/routes.js';
import { prayerCircleRoutes } from './modules/prayer-circles/routes.js';
import { pathBackRoutes } from './modules/path-back/routes.js';
import { replyChoiceRoutes } from './modules/reply-choice/routes.js';
import { calmThreadRoutes } from './modules/calm-threads/routes.js';
import { repairRoutes } from './modules/repair/routes.js';
import { conversationHelperRoutes } from './modules/conversation-helpers/routes.js';
import { partnerRoutes } from './modules/partners/routes.js';
import { kindnessHighlightRoutes } from './modules/kindness-highlights/routes.js';
import { coolDownRoutes } from './modules/cool-down/routes.js';
import { legalRoutes } from './modules/legal/routes.js';
import { podcastPublicRoutes, podcastRoutes } from './modules/podcasts/routes.js';
import { storageMediaStore } from './modules/crosspost/index.js';
import type { CrosspostOptions } from './modules/crosspost/meta.js';
import { crosspostPublicRoutes, crosspostRoutes } from './modules/crosspost/routes.js';
import { MEDIA_BUCKET } from './modules/posts/media.js';
import { futureRoutes } from './modules/future/routes.js';
import { aiRoutes } from './modules/ai/routes.js';
import { lampRoutes } from './modules/lamps/routes.js';
import { circleGoalRoutes } from './modules/circle-goals/routes.js';
import { squireRoutes } from './modules/squire/routes.js';
import { groupGiftRoutes } from './modules/group-gifts/routes.js';
import { prayerListRoutes } from './modules/prayer-list/routes.js';
import { readingPlanRoutes } from './modules/reading-plan/routes.js';
import { isSecular } from './modules/communities/index.js';
import { neutralText, RELIGIOUS_WORDS } from './modules/communities/neutral-text.js';
import { liveRoutes, practiceRoomRoutes } from './modules/live/routes.js';
import type { JaasKeys } from './modules/live/jaas.js';
import { practiceModeRoutes } from './modules/practice-mode/routes.js';
import type { Converse } from './modules/ai/provider.js';
import { highlightRoutes } from './modules/highlights/routes.js';
import { eventRoutes } from './modules/events/routes.js';
import { messageRoutes } from './modules/messages/routes.js';
import { macroNeedRoutes } from './modules/macro-needs/routes.js';
import { poolRoutes } from './modules/pools/routes.js';
import { reachRoutes } from './modules/reach/routes.js';
import { scheduleRoutes } from './modules/schedules/routes.js';
import { nodeRoutes, stationRoutes } from './modules/radio/station-routes.js';
import { witnessRoutes } from './modules/witness/routes.js';
import { churchRoutes } from './modules/churches/routes.js';
import { notebookRoutes } from './modules/notebook/routes.js';
import { givingSplitRoutes } from './modules/giving-split/routes.js';
import { reminderRoutes } from './modules/reminders/routes.js';
import { liveActivityRoutes } from './modules/live-activity/routes.js';
import { growthPublicRoutes, growthRoutes } from './modules/growth/routes.js';
import { skinRoutes } from './modules/skins/routes.js';
import { securityRoutes } from './modules/security/routes.js';
import { registerMetrics } from './metrics.js';
import { announcementRoutes } from './modules/announcements/routes.js';
import { feedbackRoutes } from './modules/feedback/routes.js';
import { pilotToolsRoutes } from './modules/pilot-tools/routes.js';
import { kindNormsRoutes } from './modules/kind-norms/routes.js';
import * as pilotTools from './modules/pilot-tools/index.js';
import { inviteRoutes, signupConfigRoutes } from './modules/invites/routes.js';
import type { SiteOptions } from './modules/site/index.js';
import { siteRoutes } from './modules/site/routes.js';
import { acrossRoutes } from './modules/across/routes.js';
import { waitlistAdminRoutes, waitlistJoinRoutes } from './modules/waitlist/routes.js';
import { listenPublicRoutes } from './modules/listen/routes.js';
import { commonFundPublicRoutes } from './modules/common-fund/routes.js';
import { sponsorPublicRoutes } from './modules/sponsors/routes.js';
import { donationPublicRoutes, donationRoutes } from './modules/donations/routes.js';
import type { StripeKeys } from './modules/donations/index.js';
import type { ZeffyKeys } from './modules/donations/zeffy.js';
import type { AppleVerifier } from './modules/store/index.js';
import { storeNotificationRoutes } from './modules/store/routes.js';
import { amplifierRoutes } from './modules/amplifier/routes.js';
import { deletionPageRoutes, type DeletionPageOptions } from './modules/deletion-page/routes.js';
import { tokenRoutes } from './modules/tokens/routes.js';
import * as ops from './modules/ops/index.js';
import type { Mailer } from './modules/digest/mailer.js';
import { docsRoutes, markScope, RouteCatalog } from './openapi.js';

export interface AppDeps {
  db: Db;
  verifyToken: TokenVerifier;
  storage?: SupabaseClient | null;
  logger?: boolean;
  /** Allowed browser origins for the web app; empty = any (development). */
  corsOrigins?: string[];
  /** AI classifier for the warn-before-posting check; null = no warnings. */
  classify?: Classifier | null;
  /** The AI for the "not God" conversation and the circle facilitator; null = fixed answers. */
  converse?: Converse | null;
  /** Radio station worker's key; null = station API off. */
  stationKey?: string | null;
  /** Requests per member per minute; 0 = no limit (tests). */
  rateLimitPerMinute?: number;
  /** The header the host's proxy puts the visitor's address in (Fly: fly-client-ip). Unset: the connection's address. */
  clientIpHeader?: string | null;
  /** Stripe keys for giving (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET); null until Steve sets them. */
  stripe?: StripeKeys | null;
  /** Zeffy's API key and webhook token (ZEFFY_API_KEY, ZEFFY_WEBHOOK_TOKEN); null until set. */
  zeffy?: ZeffyKeys | null;
  /** The public account-deletion page (Google Play); null = page off. */
  deletionPage?: DeletionPageOptions | null;
  /** Bearer token for GET /metrics (Prometheus); null = no metrics endpoint. */
  metricsToken?: string | null;
  /** The public website (landing, support, privacy, terms); null = off. */
  site?: SiteOptions | null;
  /** Outgoing email (invites); null = no email. */
  mailer?: Mailer | null;
  /** The web app's address, for invite links (…/sign-in?invite=CODE); null = no link. */
  webAppUrl?: string | null;
  /** TestFlight public links for invite emails (Prayer Tower, Open Circle); null = not in a TestFlight pilot. */
  testFlight?: { prayerTower: string | null; openCircle: string | null } | null;
  /** OpenAPI JSON and Swagger UI at /api/docs; null = off. Staff-only when restricted (production). */
  apiDocs?: { restricted: boolean; password: string | null; version: string } | null;
  /** Checks App Store signed transactions (token purchase); null = purchases can't be verified. */
  appleVerifier?: AppleVerifier | null;
  /** Cross-posting from Facebook and Threads: Meta app keys for "Connect"; null = extension only. */
  crosspost?: CrosspostOptions | null;
  /** Practice token purchases may be switched on (Admin → Practice mode); false when the App Store is set to production. */
  practicePurchases?: boolean;
  /** Jitsi as a Service keys for live rooms (JAAS_*); null = not set. */
  jaas?: JaasKeys | null;
  /** Called for every route as it's added (the security test lists them this way). */
  onRoute?: (route: { method: string; url: string }) => void;
}

// Database errors carry row values in `detail` (for example "Key (email)=(…) already exists").
// Logs keep only the kind of error, its message, code and stack (docs/PRIVACY_AUDIT.md).
export function logSafeError(err: Error) {
  const { code, constraint, table } = err as { code?: string; constraint?: string; table?: string };
  return { type: err.name, message: err.message, stack: err.stack ?? '', code, constraint, table };
}

export function buildApp({ db, verifyToken, storage = null, logger = false, corsOrigins = [], classify = null, converse = null, stationKey = null, rateLimitPerMinute = 0, clientIpHeader = null, stripe = null, zeffy = null, onRoute, deletionPage = null, site = null, metricsToken = null, apiDocs = null, mailer = null, webAppUrl = null, testFlight = null, appleVerifier = null, crosspost = null, practicePurchases = false, jaas = null }: AppDeps) {
  // Logs carry method, route, status and timing; never bodies or sign-in tokens.
  const app = Fastify({
    logger: logger
      ? {
          level: process.env.LOG_LEVEL ?? 'info',
          redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-station-key"]'],
          serializers: { err: logSafeError },
        }
      : false,
  });
  const catalog = new RouteCatalog();
  app.addHook('onRoute', (r) => {
    for (const method of [r.method].flat()) {
      if (method === 'HEAD') continue;
      catalog.add(method, r.url);
      onRoute?.({ method, url: r.url });
    }
  });
  app.register(cors, {
    // The cross-posting browser extension calls from its own origin (Chrome, Safari, Firefox).
    // It signs in with its key header, never a cookie, so these origins are safe to allow.
    origin: corsOrigins.length ? [...corsOrigins, /^(chrome|safari-web|moz)-extension:\/\/[A-Za-z0-9-]+$/] : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.setErrorHandler(async (err, req, reply) => {
    if (err instanceof AppError) {
      // Open Circle members never read religious words, even in an error.
      const secular = RELIGIOUS_WORDS.test(err.message) && req.auth?.userId ? await isSecular(db, req.auth.userId).catch(() => false) : false;
      return reply.code(err.statusCode).send({ error: err.code, message: secular ? neutralText(err.message) : err.message });
    }
    if (err instanceof ZodError) return reply.code(400).send({ error: 'invalid_request', issues: err.issues });
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '22P02') return reply.code(400).send({ error: 'invalid_request', message: 'Malformed id or value' });
    // A hidden null character (\u0000) in text: Postgres refuses it in text (22021) and in JSON (22P05).
    if (pgCode === '22021' || pgCode === '22P05') return reply.code(400).send({ error: 'invalid_request', message: 'Text contains a character that is not allowed' });
    if (pgCode === '23514' || pgCode === '23503') return reply.code(400).send({ error: 'invalid_request', message: 'Request breaks a data rule' });
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) return reply.code(statusCode).send({ error: 'invalid_request', message: (err as Error).message });
    req.log.error(err);
    // Unexpected failures only, for Admin → Operations and the ops alerts (route patterns, never ids).
    // Deliberate 5xx answers (a feature not set up, /health/ready during an outage) are not counted.
    void ops.recordError(db, { method: req.method, route: req.routeOptions.url ?? 'unmatched', status: 500 }).catch(() => undefined);
    // With the error log on (Admin → Pilot tools), the message too, grouped by route.
    void pilotTools
      .record(db, { source: 'server', place: `${req.method} ${req.routeOptions.url ?? 'unmatched'}`, message: (err as Error).message || 'Unknown error', detail: (err as Error).stack ?? null, userId: req.auth?.userId ?? null })
      .catch(() => undefined);
    return reply.code(500).send({ error: 'internal', message: 'Something went wrong' });
  });

  app.decorateRequest('auth', null);
  // Behind a proxy every connection comes from the proxy, so per-address limits use the
  // visitor's address from the proxy's header instead (one value only; a list is not trusted).
  app.decorateRequest('clientIp', '');
  const ipHeader = clientIpHeader?.toLowerCase() || null;
  app.addHook('onRequest', async (req) => {
    const v = ipHeader ? req.headers[ipHeader] : undefined;
    const ip = typeof v === 'string' ? v.trim() : '';
    req.clientIp = ip && !ip.includes(',') ? ip : req.ip;
  });
  if (metricsToken) registerMetrics(app, db, metricsToken);
  app.get('/health', async () => {
    await db.query('select 1');
    return { ok: true };
  });
  // For uptime monitors: also 503 when the worker has stopped or jobs pile up (docs/MONITORING.md).
  app.get('/health/ready', async (_req, reply) => {
    const r = ops.ready(await ops.status(db));
    return reply.code(r.ok ? 200 : 503).send(r);
  });

  // The radio station authenticates with its own key, not a member login.
  app.register(async (station) => {
    markScope(station, catalog, 'station');
    // Generous: a station polls every few seconds, but keys are checked against the database.
    if (rateLimitPerMinute > 0) await station.register(rateLimit, { keyGenerator: (req) => req.clientIp, max: 300, timeWindow: '1 minute' });
    stationRoutes(station, db, stationKey);
  });

  // Listener nodes (radio/nodes.ts): their own keys, limited per IP address.
  app.register(async (node) => {
    markScope(node, catalog, 'station');
    if (rateLimitPerMinute > 0) await node.register(rateLimit, { keyGenerator: (req) => req.clientIp, max: 30, timeWindow: '1 minute' });
    nodeRoutes(node, db);
  });

  // The API description, for developers (staff-only in production).
  if (apiDocs) {
    app.register(async (open) => {
      if (rateLimitPerMinute > 0) await open.register(rateLimit, { keyGenerator: (req) => req.clientIp, max: 30, timeWindow: '1 minute' });
      docsRoutes(open, { catalog, ...apiDocs, verifyToken, db });
    });
  }

  // What the sign-up screen needs to know before anyone is signed in.
  app.register(async (open) => {
    if (rateLimitPerMinute > 0) await open.register(rateLimit, { keyGenerator: (req) => req.clientIp, max: 60, timeWindow: '1 minute' });
    signupConfigRoutes(open, db);
  });

  // The public account-deletion page, limited per IP address.
  if (deletionPage) {
    app.register(async (open) => {
      if (rateLimitPerMinute > 0) await open.register(rateLimit, { keyGenerator: (req) => req.clientIp, max: 10, timeWindow: '1 minute' });
      deletionPageRoutes(open, db, { ...deletionPage, openCircle: site?.openCircle ?? null });
    });
  }

  // Joining the waitlist (switched off by default), limited per IP address.
  app.register(async (open) => {
    if (rateLimitPerMinute > 0) await open.register(rateLimit, { keyGenerator: (req) => req.clientIp, max: 10, timeWindow: '1 minute' });
    waitlistJoinRoutes(open, db);
  });

  // Listener receipts for radio prayers (switched off by default), limited per IP address.
  app.register(async (open) => {
    if (rateLimitPerMinute > 0) await open.register(rateLimit, { keyGenerator: (req) => req.clientIp, max: 20, timeWindow: '1 minute' });
    listenPublicRoutes(open, db);
  });

  // The public website, limited per IP address.
  if (site) {
    app.register(async (open) => {
      if (rateLimitPerMinute > 0) await open.register(rateLimit, { keyGenerator: (req) => req.clientIp, max: 60, timeWindow: '1 minute' });
      siteRoutes(open, site, db);
    });
    // Guest prayer and prayer-chain pages (each a 404 while its switch is off), limited per IP address.
    app.register(async (open) => {
      if (rateLimitPerMinute > 0) await open.register(rateLimit, { keyGenerator: (req) => req.clientIp, max: 20, timeWindow: '1 minute' });
      growthPublicRoutes(open, db, site);
    });
  }

  // The Common Prayer Fund's public report (switched off by default), limited per IP address.
  app.register(async (open) => {
    if (rateLimitPerMinute > 0) await open.register(rateLimit, { keyGenerator: (req) => req.clientIp, max: 60, timeWindow: '1 minute' });
    commonFundPublicRoutes(open, db);
    sponsorPublicRoutes(open, db);
    podcastPublicRoutes(open, db);
    donationPublicRoutes(open, db, stripe, zeffy);
    storeNotificationRoutes(open, db, appleVerifier);
    practiceRoomRoutes(open);
  });

  // Cross-posting: the browser extension (its own key), the Meta sign-in return and the Threads webhook.
  app.register(async (open) => {
    if (rateLimitPerMinute > 0) await open.register(rateLimit, { max: 120, timeWindow: '1 minute' });
    const images = storage
      ? storageMediaStore(async (path, bytes, contentType) => {
          const { error } = await storage.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType });
          if (error) throw new AppError(502, 'storage_error', error.message);
        })
      : null;
    crosspostPublicRoutes(open, db, crosspost, images);
  });

  // Everything else requires a signed-in member.
  app.register(async (authed) => {
    markScope(authed, catalog, 'member');
    authed.addHook('preHandler', makeAuthHook(verifyToken, db));
    // Every successful staff change goes to the audit log (Admin → Audit log).
    authed.addHook('onSend', auditHook(db));
    // Counted per member after sign-in, so people sharing a network don't share a limit.
    if (rateLimitPerMinute > 0) {
      await authed.register(rateLimit, {
        hook: 'preHandler',
        max: rateLimitPerMinute,
        timeWindow: '1 minute',
        keyGenerator: (req) => req.auth?.userId ?? req.clientIp,
      });
    }
    accountRoutes(authed, db, storage);
    postRoutes(authed, db, storage);
    feedRoutes(authed, db, storage);
    prayerActionRoutes(authed, db);
    commitmentRoutes(authed, db);
    tokenRoutes(authed, db);
    radioRoutes(authed, db);
    amplifierRoutes(authed, db);
    reachRoutes(authed, db);
    poolRoutes(authed, db);
    scheduleRoutes(authed, db);
    macroNeedRoutes(authed, db);
    highlightRoutes(authed, db);
    messageRoutes(authed, db);
    eventRoutes(authed, db);
    careRoutes(authed, db);
    witnessRoutes(authed, db);
    churchRoutes(authed, db);
    notebookRoutes(authed, db);
    growthRoutes(authed, db);
    givingSplitRoutes(authed, db);
    reminderRoutes(authed, db);
    liveActivityRoutes(authed, db);
    skinRoutes(authed, db);
    securityRoutes(authed, db);
    futureRoutes(authed, db, appleVerifier, practicePurchases);
    aiRoutes(authed, db, converse);
    lampRoutes(authed, db);
    circleGoalRoutes(authed, db);
    squireRoutes(authed, db);
    groupGiftRoutes(authed, db);
    prayerListRoutes(authed, db);
    readingPlanRoutes(authed, db);
    liveRoutes(authed, db, jaas);
    practiceModeRoutes(authed, db, { converse, jaas: !!jaas, appStore: !!appleVerifier, practicePurchases });
    communityRoutes(authed, db);
    surveyRoutes(authed, db);
    quickReactionRoutes(authed, db);
    meaningReactionRoutes(authed, db);
    practiceRoutes(authed, db);
    checkBackRoutes(authed, db);
    kindMilestoneRoutes(authed, db);
    commentKindnessRoutes(authed, db);
    thankNoteRoutes(authed, db);
    prayerCircleRoutes(authed, db);
    pathBackRoutes(authed, db);
    replyChoiceRoutes(authed, db);
    calmThreadRoutes(authed, db);
    repairRoutes(authed, db);
    conversationHelperRoutes(authed, db);
    partnerRoutes(authed, db);
    kindnessHighlightRoutes(authed, db);
    coolDownRoutes(authed, db);
    waitlistAdminRoutes(authed, db);
    acrossRoutes(authed, db);
    legalRoutes(authed, db);
    podcastRoutes(authed, db);
    crosspostRoutes(authed, db, crosspost);
    donationRoutes(authed, db, stripe, webAppUrl, zeffy);
    spokenPrayerRoutes(authed, db, storage);
    awardRoutes(authed, db);
    notificationRoutes(authed, db);
    moderationRoutes(authed, db, classify);
    harmRoutes(authed, db);
    safetyCenterRoutes(authed, db);
    promptRoutes(authed, db);
    tierRoutes(authed, db);
    feedbackRoutes(authed, db);
    pilotToolsRoutes(authed, db);
    kindNormsRoutes(authed, db);
    inviteRoutes(authed, db, mailer, { webAppUrl, appStoreUrl: site?.appStoreUrl ?? null, playStoreUrl: site?.playStoreUrl ?? null, testFlightUrl: testFlight?.prayerTower ?? null, openCircleTestFlightUrl: testFlight?.openCircle ?? null });
    announcementRoutes(authed, db);
    adminRoutes(authed, db, storage);
  });

  return app;
}
