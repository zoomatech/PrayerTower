import { prayedForLine } from '@/lib/pray-widget';

// A stand-in translator that shows the key and its values.
const t = (key: string, o?: Record<string, unknown>) => `${key}${o ? ` ${JSON.stringify(o)}` : ''}`;

describe('prayedForLine', () => {
  it('is empty while switched off or when nobody prayed', () => {
    expect(prayedForLine({ enabled: false }, t)).toBe('');
    expect(prayedForLine({ enabled: true, names: [], people: 0 }, t)).toBe('');
  });

  it('names one or two people, then counts the rest', () => {
    expect(prayedForLine({ enabled: true, names: ['Ana'], people: 1 }, t)).toBe('growth.widgetPrayedForOne {"name":"Ana"}');
    expect(prayedForLine({ enabled: true, names: ['Ana', 'Lee'], people: 2 }, t)).toBe('growth.widgetPrayedForTwo {"name":"Ana","other":"Lee"}');
    expect(prayedForLine({ enabled: true, names: ['Ana', 'Lee'], people: 5 }, t)).toBe('growth.widgetPrayedForMore {"name":"Ana","count":4}');
  });

  it('only counts when everyone prayed anonymously', () => {
    expect(prayedForLine({ enabled: true, names: [], people: 3 }, t)).toBe('growth.widgetPrayedForCount {"count":3}');
  });
});
