// Crash and error reporting with Sentry, off unless EXPO_PUBLIC_SENTRY_DSN is
// set at build time. Reports are not linked to a member: no user, no screen
// text, no request bodies, no console logs. If this is turned on, declare
// "Crash Data" (not linked to the user) in the store privacy answers.
import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

import { env } from './env';

export const monitoringOn = !!env.sentryDsn;

if (monitoringOn) {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Touch breadcrumbs can name what was tapped, and console logs can echo content.
    enableUserInteractionTracing: false,
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' || crumb.category === 'touch' ? null : crumb),
    beforeSend: (event) => {
      delete event.user;
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
        delete event.request.cookies;
      }
      return event;
    },
  });
}

/** Wraps the root component so render crashes are reported; a no-op when monitoring is off. */
export function withMonitoring(Root: ComponentType<Record<string, unknown>>): ComponentType<Record<string, unknown>> {
  return monitoringOn ? Sentry.wrap(Root) : Root;
}
