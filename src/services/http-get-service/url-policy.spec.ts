import { describe, it, expect } from 'vitest';
import { checkUrl } from './url-policy.js';

describe('checkUrl', () => {
  it.each([
    'https://example.com/x',
    'https://example.com:8443/x',
    'https://8.8.8.8/',
    'https://[2001:db8::1]/',
    // Only the `.localhost` suffix is reserved, not the label.
    'https://localhost.example.com/',
    // Just outside 172.16.0.0/12 and 100.64.0.0/10.
    'https://172.32.0.1/',
    'https://100.128.0.1/',
    // IPv4-mapped IPv6 is judged by the embedded IPv4 address.
    'https://[::ffff:8.8.8.8]/'
  ])('allows %s', url => {
    expect(checkUrl(url)).toEqual({ allowed: true });
  });

  it.each([
    ['http://example.com/', 'scheme is not https'],
    ['ftp://example.com/', 'scheme is not https'],
    ['not a url', 'not a valid URL'],
    ['https://localhost/', 'host is localhost'],
    ['https://LOCALHOST./', 'host is localhost'],
    ['https://a.b.localhost/', 'host is localhost'],
    ['https://127.0.0.1/', 'host is a loopback address'],
    ['https://127.255.255.254/', 'host is a loopback address'],
    // Shorthand IPv4 forms the URL parser normalises to 127.0.0.1.
    ['https://0x7f.1/', 'host is a loopback address'],
    ['https://2130706433/', 'host is a loopback address'],
    ['https://127.1/', 'host is a loopback address'],
    ['https://10.1.2.3/', 'host is a private address'],
    ['https://172.16.0.1/', 'host is a private address'],
    ['https://172.31.255.255/', 'host is a private address'],
    ['https://192.168.1.1/', 'host is a private address'],
    ['https://100.64.0.1/', 'host is a private address'],
    ['https://100.100.100.200/', 'host is a private address'],
    [
      'https://169.254.169.254/latest/meta-data',
      'host is a link-local address'
    ],
    ['https://0.0.0.0/', 'host is an unspecified address'],
    ['https://[::1]/', 'host is a loopback address'],
    ['https://[0:0:0:0:0:0:0:1]/', 'host is a loopback address'],
    ['https://[::]/', 'host is an unspecified address'],
    ['https://[fc00::1]/', 'host is a private address'],
    ['https://[fd12:3456::1]/', 'host is a private address'],
    ['https://[fe80::1]/', 'host is a link-local address'],
    ['https://[::ffff:127.0.0.1]/', 'host is a loopback address'],
    ['https://[::ffff:10.0.0.1]/', 'host is a private address']
  ])('refuses %s (%s)', (url, reason) => {
    expect(checkUrl(url)).toEqual({ allowed: false, reason });
  });
});
