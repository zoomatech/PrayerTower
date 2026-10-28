// Error reporting, loaded before the app with `node --import ./dist/src/instrument.js`.
// Off unless SENTRY_DSN is set. Prayer requests are sensitive (faith, health),
// so nothing a member wrote is sent: no request or response bodies, no user
// info, cookies, headers or database query values. Errors carry the route,
// the stack trace and the request id only.
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend: scrub,
  });
}

/** Belt and braces: drop anything that could hold member content even if a default changes. */
export function scrub<E extends Sentry.ErrorEvent>(event: E): E {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  delete event.user;
  if (event.extra) delete event.extra.body;
  return event;
}
