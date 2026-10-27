// Safe download of a user-supplied ICS feed URL (Outlook "publish calendar"
// link). The URL is user input, so this is an SSRF surface:
//   • https only, port 443, no credentials, ≤ 2048 chars;
//   • the host is resolved up front and EVERY address must be public
//     (private, loopback, link-local, CGNAT, documentation, multicast, reserved
//     v4/v6 ranges and IPv4-mapped v6 are refused); IP literals are checked
//     directly (Node skips `lookup` for them);
//   • the connection is pinned to the validated addresses via a custom
//     `lookup` (no DNS-rebinding window), SNI/Host stay the original name;
//     ALL validated addresses are offered (IPv4 first, Node's happy eyeballs
//     falls back between them), so a host whose first AAAA record is
//     unreachable (no working IPv6 on the server) still works;
//   • redirects are followed manually (max 3), each hop re-validated;
//   • hard 10 s deadline for the whole download, 5 MB cap (Content-Length and
//     streamed bytes), identity encoding only;
//   • the body must be an iCalendar (BEGIN:VCALENDAR).
// The URL is a secret: it is never logged or put into an error message.

import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import { BlockList, isIP } from "node:net";

import { IcsFetchError } from "@/lib/calendar/ics-errors";

export const ICS_FETCH_TIMEOUT_MS = 10_000;
export const ICS_MAX_BYTES = 5 * 1024 * 1024;
export const ICS_MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;

// --- URL normalisation ------------------------------------------------------

/**
 * Validate and normalise a pasted feed URL: `webcal(s)://` → `https://`,
 * https only, port 443, no user:password, and (for user input) Outlook's
 * `…/calendar.html` page link → its `…/calendar.ics` feed.
 */
export function normalizeIcsUrl(
  raw: string,
  { fromUser = true }: { fromUser?: boolean } = {},
): URL {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) {
    throw new IcsFetchError("INVALID_URL");
  }
  const rewritten = trimmed.replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(rewritten);
  } catch {
    throw new IcsFetchError("INVALID_URL");
  }
  if (url.protocol !== "https:") {
    throw new IcsFetchError("NOT_HTTPS");
  }
  if (url.username || url.password) {
    throw new IcsFetchError("CREDENTIALS_IN_URL");
  }
  if (url.port && url.port !== "443") {
    throw new IcsFetchError("BLOCKED_ADDRESS");
  }
  if (!url.hostname) {
    throw new IcsFetchError("INVALID_URL");
  }
  url.hash = "";
  if (fromUser && /\/calendar\.html$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/calendar\.html$/i, "calendar.ics");
  }
  return url;
}

/** What the UI may show about a feed URL: host + masked path, never a token. */
export function urlHint(url: URL): string {
  const segments = url.pathname.split("/").filter(Boolean);
  const host = url.hostname;
  if (segments.length === 0) {
    return host;
  }
  let last = segments[segments.length - 1];
  if (last.length > 24) {
    last = `…${last.slice(-8)}`;
  }
  return segments.length === 1 ? `${host}/${last}` : `${host}/…/${last}`;
}

// --- address guard ------------------------------------------------------------

// Two separate lists: Node's BlockList matches IPv4 queries against IPv6
// rules via the IPv4-mapped form, so ::ffff:0:0/96 would block every IPv4.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96], // unspecified, loopback, IPv4-compatible (deprecated)
  ["::ffff:0:0", 96], // IPv4-mapped — never a legitimate public feed host
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48],
  ["100::", 64], // discard
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (could embed a private v4)
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

/** True for any address the feed fetcher must never connect to. */
export function isBlockedAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "").split("%")[0];
  const family = isIP(bare);
  if (family === 4) {
    return blockedV4.check(bare, "ipv4");
  }
  if (family === 6) {
    return blockedV6.check(bare, "ipv6");
  }
  return true; // not an IP at all → refuse
}

export type ResolvedAddress = { address: string; family: number };
export type ResolveFn = (hostname: string) => Promise<ResolvedAddress[]>;

const defaultResolve: ResolveFn = async (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

/**
 * Validated addresses in connection order: IPv4 first (works on every
 * server; IPv6 is often broken), then IPv6, duplicates removed.
 */
export function orderAddresses(addresses: ResolvedAddress[]): ResolvedAddress[] {
  const seen = new Set<string>();
  const unique = addresses.filter((entry) => {
    if (seen.has(entry.address)) {
      return false;
    }
    seen.add(entry.address);
    return true;
  });
  return [
    ...unique.filter((entry) => entry.family === 4),
    ...unique.filter((entry) => entry.family !== 4),
  ];
}

async function resolvePublicAddresses(
  hostname: string,
  resolve: ResolveFn,
): Promise<ResolvedAddress[]> {
  const literal = hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(literal);
  if (literalFamily) {
    if (isBlockedAddress(literal)) {
      throw new IcsFetchError("BLOCKED_ADDRESS");
    }
    return [{ address: literal, family: literalFamily }];
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolve(hostname);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") {
      throw new IcsFetchError("DNS_FAILED");
    }
    throw new IcsFetchError("NETWORK");
  }
  if (addresses.length === 0) {
    throw new IcsFetchError("DNS_FAILED");
  }
  // Reject when ANY record is non-public: a mixed answer is a rebinding trick.
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new IcsFetchError("BLOCKED_ADDRESS");
  }
  return orderAddresses(
    addresses.map((entry) => ({
      address: entry.address,
      family: isIP(entry.address) || entry.family,
    })),
  );
}

// --- transport ----------------------------------------------------------------

export type TransportRequest = {
  url: URL;
  /** First validated address (= `addresses[0]`). */
  address: string;
  family: number;
  /** Every validated address, in connection order; nothing else may be used. */
  addresses: ResolvedAddress[];
  headers: Record<string, string>;
  signal: AbortSignal;
};

export type TransportResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  destroy: () => void;
};

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

/**
 * `lookup` replacement that answers only with the pre-validated addresses
 * (never a fresh DNS query). With `all` (Node's happy eyeballs /
 * autoSelectFamily) every address is offered so a dead IPv6 route falls back
 * to IPv4 and vice versa.
 */
export function pinnedLookup(addresses: ResolvedAddress[]) {
  return (
    _hostname: string,
    options: unknown,
    callback: LookupCallback,
  ): void => {
    const opts = (typeof options === "object" && options !== null ? options : {}) as {
      all?: boolean;
      family?: number | string;
    };
    const wanted =
      opts.family === 4 || opts.family === "IPv4"
        ? 4
        : opts.family === 6 || opts.family === "IPv6"
          ? 6
          : 0;
    const candidates = wanted
      ? addresses.filter((entry) => entry.family === wanted)
      : addresses;
    if (candidates.length === 0) {
      const error = Object.assign(new Error("No validated address"), {
        code: "ENOTFOUND",
      }) as NodeJS.ErrnoException;
      callback(error, opts.all ? [] : "", undefined);
      return;
    }
    if (opts.all) {
      callback(
        null,
        candidates.map((entry) => ({ address: entry.address, family: entry.family })),
      );
      return;
    }
    callback(null, candidates[0].address, candidates[0].family);
  };
}

/** node:https with the connection pinned to the pre-validated IPs. */
export const httpsTransport: Transport = (request) =>
  new Promise((resolve, reject) => {
    const hostname = request.url.hostname.replace(/^\[|\]$/g, "");
    const addresses =
      request.addresses.length > 0
        ? request.addresses
        : [{ address: request.address, family: request.family }];
    // Passed on to tls/net.connect (not declared on RequestOptions' type).
    const options: https.RequestOptions & {
      autoSelectFamily?: boolean;
      autoSelectFamilyAttemptTimeout?: number;
    } = {
      method: "GET",
      host: hostname,
      port: 443,
      path: `${request.url.pathname}${request.url.search}`,
      headers: request.headers,
      // SNI must be a host name (not an IP literal).
      servername: isIP(hostname) ? undefined : hostname,
      agent: false,
      signal: request.signal,
      // Try every validated address (happy eyeballs), not just the first.
      autoSelectFamily: addresses.length > 1,
      autoSelectFamilyAttemptTimeout: 500,
      lookup: pinnedLookup(addresses) as unknown as https.RequestOptions["lookup"],
    };
    const req = https.request(
      options,
      (response) => {
        // A connection reset mid-body ("aborted") must never become an
        // uncaught 'error' event; the body iterator reports it instead.
        response.on("error", () => {});
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: response,
          destroy: () => response.destroy(),
        });
      },
    );
    req.on("error", reject);
    req.end();
  });

// --- fetch --------------------------------------------------------------------

export type IcsFetchResult =
  | {
      status: "ok";
      body: string;
      etag: string | null;
      lastModified: string | null;
      finalUrl: URL;
    }
  | { status: "not-modified" };

export type FetchIcsOptions = {
  etag?: string | null;
  lastModified?: string | null;
  resolve?: ResolveFn;
  transport?: Transport;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

function header(
  headers: TransportResponse["headers"],
  name: string,
): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class AbortedError extends Error {}

/** Reject as soon as `signal` aborts (so even a hung step honours the deadline). */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new AbortedError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AbortedError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function readBody(
  response: TransportResponse,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const declared = Number(header(response.headers, "content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new IcsFetchError("TOO_LARGE");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  const iterator = response.body[Symbol.asyncIterator]();
  try {
    for (;;) {
      const next = await untilAborted(iterator.next(), signal);
      if (next.done) {
        break;
      }
      const chunk = Buffer.from(next.value);
      total += chunk.length;
      if (total > maxBytes) {
        throw new IcsFetchError("TOO_LARGE");
      }
      chunks.push(chunk);
    }
  } finally {
    if (total > maxBytes || signal.aborted) {
      response.destroy();
    }
  }
  return Buffer.concat(chunks);
}

/**
 * Download the feed behind `rawUrl` with all the guards above. Conditional
 * (ETag / Last-Modified) when the cached validators are passed.
 */
export async function fetchIcsFeed(
  rawUrl: string,
  {
    etag,
    lastModified,
    resolve = defaultResolve,
    transport = httpsTransport,
    timeoutMs = ICS_FETCH_TIMEOUT_MS,
    maxBytes = ICS_MAX_BYTES,
    maxRedirects = ICS_MAX_REDIRECTS,
  }: FetchIcsOptions = {},
): Promise<IcsFetchResult> {
  let url = normalizeIcsUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let hop = 0; ; hop += 1) {
      const targets = await untilAborted(
        resolvePublicAddresses(url.hostname, resolve),
        controller.signal,
      );
      const headers: Record<string, string> = {
        "User-Agent": "iuriverse-calendar/1.0",
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5",
        "Accept-Encoding": "identity",
      };
      if (hop === 0 && etag) {
        headers["If-None-Match"] = etag;
      }
      if (hop === 0 && lastModified) {
        headers["If-Modified-Since"] = lastModified;
      }

      const response = await untilAborted(
        transport({
          url,
          address: targets[0].address,
          family: targets[0].family,
          addresses: targets,
          headers,
          signal: controller.signal,
        }),
        controller.signal,
      );

      if (REDIRECT_STATUSES.has(response.status)) {
        response.destroy();
        if (hop >= maxRedirects) {
          throw new IcsFetchError("TOO_MANY_REDIRECTS");
        }
        const location = header(response.headers, "location");
        if (!location) {
          throw new IcsFetchError("HTTP_STATUS", response.status);
        }
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new IcsFetchError("BLOCKED_ADDRESS");
        }
        // Outlook sends an unpublished / revoked link to its error page
        // (…/errorFE.aspx?httpCode=404): report the real status, not the
        // error page's own one.
        if (/\/errorfe\.aspx$/i.test(next.pathname)) {
          const code = Number(next.searchParams.get("httpCode"));
          throw new IcsFetchError(
            "HTTP_STATUS",
            Number.isInteger(code) && code >= 400 && code < 600 ? code : 404,
          );
        }
        try {
          url = normalizeIcsUrl(next.toString(), { fromUser: false });
        } catch {
          // Redirect to http://, another port, credentials… → refused.
          throw new IcsFetchError("BLOCKED_ADDRESS");
        }
        continue;
      }

      if (response.status === 304) {
        response.destroy();
        return { status: "not-modified" };
      }

      if (response.status < 200 || response.status >= 300) {
        response.destroy();
        throw new IcsFetchError("HTTP_STATUS", response.status);
      }

      const buffer = await readBody(response, maxBytes, controller.signal);
      const body = new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "");
      if (!/BEGIN:VCALENDAR/i.test(body)) {
        throw new IcsFetchError("NOT_ICS");
      }
      return {
        status: "ok",
        body,
        etag: header(response.headers, "etag"),
        lastModified: header(response.headers, "last-modified"),
        finalUrl: url,
      };
    }
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof IcsFetchError && error.code === "TOO_LARGE")) {
      throw new IcsFetchError("TIMEOUT");
    }
    if (error instanceof IcsFetchError) {
      throw error;
    }
    throw new IcsFetchError("NETWORK");
  } finally {
    clearTimeout(timer);
  }
}
