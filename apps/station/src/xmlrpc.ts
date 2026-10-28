// Just enough XML-RPC for fldigi (string and int params; string, int, boolean
// and double results). fldigi's server is unauthenticated, so it must stay on
// 127.0.0.1 (see the build paper).

export type RpcValue = string | number | boolean;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescape = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function encodeParam(v: RpcValue): string {
  if (typeof v === 'number') return `<param><value><int>${Math.trunc(v)}</int></value></param>`;
  if (typeof v === 'boolean') return `<param><value><boolean>${v ? 1 : 0}</boolean></value></param>`;
  return `<param><value><string>${escape(v)}</string></value></param>`;
}

export function encodeCall(method: string, params: RpcValue[] = []): string {
  return `<?xml version="1.0"?><methodCall><methodName>${escape(method)}</methodName><params>${params.map(encodeParam).join('')}</params></methodCall>`;
}

/** The first <value> of a methodResponse; throws on a fault. */
export function decodeResponse(xml: string): RpcValue | null {
  if (/<fault>/.test(xml)) {
    const msg = /<name>faultString<\/name>\s*<value>(?:<string>)?([\s\S]*?)(?:<\/string>)?<\/value>/.exec(xml)?.[1];
    throw new Error(`XML-RPC fault: ${msg ? unescape(msg) : 'unknown'}`);
  }
  const m = /<value>([\s\S]*?)<\/value>/.exec(xml);
  if (!m) return null;
  const inner = m[1]!.trim();
  const typed = /^<(string|int|i4|boolean|double)>([\s\S]*)<\/\1>$/.exec(inner) ?? /^<(string)\/>$/.exec(inner);
  if (!typed) return unescape(inner); // untyped value = string
  const [, type, text = ''] = typed;
  if (type === 'int' || type === 'i4' || type === 'double') return Number(text);
  if (type === 'boolean') return text.trim() === '1';
  return unescape(text);
}

export class XmlRpcClient {
  constructor(
    private url: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async call(method: string, ...params: RpcValue[]): Promise<RpcValue | null> {
    const res = await this.fetchImpl(this.url, { method: 'POST', headers: { 'content-type': 'text/xml' }, body: encodeCall(method, params) });
    if (!res.ok) throw new Error(`XML-RPC ${method}: HTTP ${res.status}`);
    return decodeResponse(await res.text());
  }
}
