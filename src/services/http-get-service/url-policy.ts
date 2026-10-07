/**
 * Address policy for the built-in HTTP service.
 *
 * Internal module — not exported from `index.ts`.
 */

/** Outcome of {@link checkUrl}. `reason` is fixed text, safe to put in an error. */
export type UrlCheck = { allowed: true } | { allowed: false; reason: string };

/**
 * Decide whether the built-in HTTP service may fetch `url`.
 *
 * The verifier fetches URLs the credential chooses — contexts, did:web
 * documents, status lists, schemas — so on a server an unchecked fetch lets a
 * credential reach the server's own network. Only `https:` is allowed, and
 * never to `localhost` or to a loopback, private, link-local or unspecified
 * IP literal. The check runs on the first URL and on every redirect hop.
 *
 * The host is judged as a name or a literal only. Browsers and React Native
 * offer no DNS lookup, so a public name that resolves to a private address
 * is not caught here.
 */
export function checkUrl(url: string): UrlCheck {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return refused('not a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    return refused('scheme is not https');
  }

  // Judge the parsed hostname, never the raw string: the URL parser has
  // already turned `0x7f.1`, `2130706433` and `127.1` into `127.0.0.1`, and
  // compressed IPv6 literals.
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return refused('host is localhost');
  }

  if (IPV4_LITERAL.test(host)) {
    return checkIpv4(ipv4ToInt(host));
  }

  if (host.startsWith('[')) {
    return checkIpv6(host.slice(1, -1));
  }

  return ALLOWED;
}

const ALLOWED: UrlCheck = { allowed: true };

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

function refused(reason: string): UrlCheck {
  return { allowed: false, reason };
}

/** IPv4 ranges the policy refuses, as `[network, prefix length, reason]`. */
const IPV4_BLOCKED: ReadonlyArray<readonly [string, number, string]> = [
  ['0.0.0.0', 8, 'host is an unspecified address'],
  ['127.0.0.0', 8, 'host is a loopback address'],
  ['10.0.0.0', 8, 'host is a private address'],
  ['172.16.0.0', 12, 'host is a private address'],
  ['192.168.0.0', 16, 'host is a private address'],
  // Carrier-grade NAT space. Treated as private because some cloud
  // providers serve instance metadata from it (e.g. 100.100.100.200).
  ['100.64.0.0', 10, 'host is a private address'],
  ['169.254.0.0', 16, 'host is a link-local address']
];

function checkIpv4(address: number): UrlCheck {
  for (const [network, prefix, reason] of IPV4_BLOCKED) {
    if (inCidr(address, ipv4ToInt(network), prefix)) {
      return refused(reason);
    }
  }
  return ALLOWED;
}

function ipv4ToInt(dotted: string): number {
  return (
    dotted
      .split('.')
      .reduce((acc, octet) => acc * 256 + Number.parseInt(octet, 10), 0) >>> 0
  );
}

function inCidr(address: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) >>> 0 === (network & mask) >>> 0;
}

function checkIpv6(literal: string): UrlCheck {
  const groups = expandIpv6(literal);
  if (groups === undefined) {
    return refused('not a valid URL');
  }

  if (groups.every(g => g === 0)) {
    return refused('host is an unspecified address');
  }
  if (groups.slice(0, 7).every(g => g === 0) && groups[7] === 1) {
    return refused('host is a loopback address');
  }
  // IPv4-mapped (::ffff:0:0/96): judge the embedded IPv4 address.
  if (groups.slice(0, 5).every(g => g === 0) && groups[5] === 0xffff) {
    return checkIpv4(((groups[6] << 16) | groups[7]) >>> 0);
  }
  if ((groups[0] & 0xfe00) === 0xfc00) {
    return refused('host is a private address');
  }
  if ((groups[0] & 0xffc0) === 0xfe80) {
    return refused('host is a link-local address');
  }
  return ALLOWED;
}

/**
 * Expand an IPv6 address (without brackets) into its eight 16-bit groups.
 * The URL parser has already normalised it, so a trailing dotted IPv4 part
 * never appears here.
 */
function expandIpv6(literal: string): number[] | undefined {
  const halves = literal.split('::');
  if (halves.length > 2) {
    return undefined;
  }
  const head = halves[0] === '' ? [] : halves[0].split(':');
  const tail =
    halves.length === 2 && halves[1] !== '' ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) {
    return undefined;
  }
  const groups = [
    ...head,
    ...Array<string>(halves.length === 2 ? missing : 0).fill('0'),
    ...tail
  ].map(g => Number.parseInt(g, 16));
  return groups.some(g => Number.isNaN(g) || g < 0 || g > 0xffff)
    ? undefined
    : groups;
}
