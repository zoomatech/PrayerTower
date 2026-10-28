// Visual tokens for the V1 "Classic" theme. A feed theme's `tokens` can override these later.
export const colors = {
  background: '#FBF8F3',
  surface: '#FFFFFF',
  border: '#E8E1D6',
  text: '#2B2433',
  textMuted: '#6F6677',
  primary: '#5B3E96',
  primarySoft: '#EFE9F8',
  gold: '#C9A227',
  goldSoft: '#FBF3D9',
  /** Gold for text: at least 4.5:1 on white, the background and goldSoft (WCAG AA). Plain gold is for fills only. */
  goldText: '#7D6308',
  danger: '#B3261E',
  // Urgency light: calm → urgent.
  urgency: ['#9BC59D', '#E6C35C', '#E8964A', '#D9534F'] as const,
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
export const maxContentWidth = 640;
/** Window widths (points) for wider layouts on iPad, Mac and the web. 768 is the narrowest iPad held upright. */
export const breakpoints = { split: 768, twoColumnFeed: 1280 };

export const type = {
  title: { fontSize: 26, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  // The post-type label on cards is set in a script face.
  script: { fontSize: 15, fontStyle: 'italic' as const, fontFamily: 'serif', color: colors.primary },
};
