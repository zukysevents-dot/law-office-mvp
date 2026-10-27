import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";

import { OUTLOOK_SAMPLE_ICS } from "@/lib/calendar/__fixtures__/outlook-sample";
import {
  ICS_ERROR_CODES,
  IcsFetchError,
  icsErrorMessage,
  type IcsErrorCode,
} from "@/lib/calendar/ics-errors";
import {
  fetchIcsFeed,
  isBlockedAddress,
  normalizeIcsUrl,
  orderAddresses,
  pinnedLookup,
  urlHint,
  type ResolveFn,
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from "@/lib/calendar/ics-fetch";

const OUTLOOK_URL =
  "https://outlook.office365.com/owa/calendar/abc@kancelar.cz/0123456789abcdef0123456789abcdef/calendar.ics";

function isCode(code: IcsErrorCode, status?: number) {
  return (error: unknown) =>
    error instanceof IcsFetchError &&
    error.code === code &&
    (status === undefined || error.status === status);
}

// --- normalizeIcsUrl / urlHint -------------------------------------------------

test("normalizeIcsUrl converts webcal and Outlook's HTML link", () => {
  assert.equal(
    normalizeIcsUrl("webcal://outlook.live.com/owa/calendar/x/y/calendar.ics").toString(),
    "https://outlook.live.com/owa/calendar/x/y/calendar.ics",
  );
  assert.equal(
    normalizeIcsUrl("  webcals://outlook.live.com/a/calendar.ics ").protocol,
    "https:",
  );
  assert.equal(
    normalizeIcsUrl("https://outlook.office365.com/owa/calendar/x/y/calendar.html").pathname,
    "/owa/calendar/x/y/calendar.ics",
  );
  assert.equal(normalizeIcsUrl(`${OUTLOOK_URL}#frag`).hash, "");
});

test("normalizeIcsUrl rejects unsafe or invalid URLs", () => {
  assert.throws(() => normalizeIcsUrl("http://example.com/calendar.ics"), isCode("NOT_HTTPS"));
  assert.throws(() => normalizeIcsUrl("ftp://example.com/calendar.ics"), isCode("NOT_HTTPS"));
  assert.throws(() => normalizeIcsUrl("file:///etc/passwd"), isCode("NOT_HTTPS"));
  assert.throws(
    () => normalizeIcsUrl("https://user:secret@example.com/calendar.ics"),
    isCode("CREDENTIALS_IN_URL"),
  );
  assert.throws(
    () => normalizeIcsUrl("https://example.com:8443/calendar.ics"),
    isCode("BLOCKED_ADDRESS"),
  );
  assert.throws(() => normalizeIcsUrl("tohle není odkaz"), isCode("INVALID_URL"));
  assert.throws(() => normalizeIcsUrl(""), isCode("INVALID_URL"));
  assert.throws(
    () => normalizeIcsUrl(`https://example.com/${"a".repeat(2100)}`),
    isCode("INVALID_URL"),
  );
  // Explicit :443 is fine.
  assert.equal(normalizeIcsUrl("https://example.com:443/c.ics").hostname, "example.com");
});

test("urlHint never contains the secret path", () => {
  const hint = urlHint(normalizeIcsUrl(OUTLOOK_URL));
  assert.equal(hint, "outlook.office365.com/…/calendar.ics");
  assert.ok(!hint.includes("0123456789abcdef"));
  assert.equal(
    urlHint(new URL("https://cal.example.com/0123456789abcdef0123456789abcdef.ics")),
    "cal.example.com/…cdef.ics",
  );
});

// --- isBlockedAddress ----------------------------------------------------------

test("isBlockedAddress refuses private, loopback, link-local and mapped addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.5.4",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::",
    "::1",
    "fe80::1",
    "fd00::1",
    "fc00::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:1::1",
    "[::1]",
    "not-an-ip",
  ]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
});

test("isBlockedAddress allows public addresses (e.g. Microsoft)", () => {
  for (const address of ["52.97.0.1", "40.99.4.34", "2603:1026::1", "2620:1ec:8f8::10", "8.8.8.8"]) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

// --- fetchIcsFeed with injected resolver/transport -----------------------------

const publicResolve: ResolveFn = async () => [{ address: "52.97.0.1", family: 4 }];

function response(
  status: number,
  body: string | Uint8Array[] | AsyncIterable<Uint8Array> = "",
  headers: TransportResponse["headers"] = {},
): TransportResponse {
  let iterable: AsyncIterable<Uint8Array>;
  if (typeof body === "string") {
    const bytes = Buffer.from(body, "utf8");
    iterable = (async function* () {
      yield bytes;
    })();
  } else if (Array.isArray(body)) {
    iterable = (async function* () {
      yield* body;
    })();
  } else {
    iterable = body;
  }
  return { status, headers, body: iterable, destroy: () => {} };
}

function scriptedTransport(steps: TransportResponse[]) {
  const calls: TransportRequest[] = [];
  const transport: Transport = async (request) => {
    calls.push(request);
    const next = steps.shift();
    if (!next) {
      throw new Error("unexpected request");
    }
    return next;
  };
  return { transport, calls };
}

const neverCalled: Transport = async () => {
  throw new Error("transport must not be called");
};

test("a host resolving to a private address is blocked before connecting", async () => {
  let transportCalled = false;
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, {
      resolve: async () => [{ address: "10.0.0.5", family: 4 }],
      transport: async () => {
        transportCalled = true;
        throw new Error("no");
      },
    }),
    isCode("BLOCKED_ADDRESS"),
  );
  assert.equal(transportCalled, false);
});

test("a mixed DNS answer (public + private) is blocked", async () => {
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, {
      resolve: async () => [
        { address: "52.97.0.1", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
      transport: neverCalled,
    }),
    isCode("BLOCKED_ADDRESS"),
  );
});

test("IP literals are checked without DNS and without connecting", async () => {
  let resolveCalled = false;
  const resolve: ResolveFn = async () => {
    resolveCalled = true;
    return [];
  };
  for (const url of [
    "https://127.0.0.1/calendar.ics",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/calendar.ics",
    "https://[::ffff:127.0.0.1]/calendar.ics",
  ]) {
    await assert.rejects(
      fetchIcsFeed(url, { resolve, transport: neverCalled }),
      isCode("BLOCKED_ADDRESS"),
      url,
    );
  }
  assert.equal(resolveCalled, false);
});

test("an unknown host → DNS_FAILED", async () => {
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, {
      resolve: async () => {
        throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
      },
      transport: neverCalled,
    }),
    isCode("DNS_FAILED"),
  );
});

test("the connection is pinned to the validated address with safe headers", async () => {
  const { transport, calls } = scriptedTransport([
    response(200, OUTLOOK_SAMPLE_ICS, { etag: '"v1"', "last-modified": "Mon, 26 Oct 2026 10:00:00 GMT" }),
  ]);
  const result = await fetchIcsFeed(OUTLOOK_URL, { resolve: publicResolve, transport });
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.match(result.body, /BEGIN:VCALENDAR/);
    assert.equal(result.etag, '"v1"');
    assert.equal(result.lastModified, "Mon, 26 Oct 2026 10:00:00 GMT");
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].address, "52.97.0.1");
  assert.equal(calls[0].url.hostname, "outlook.office365.com");
  assert.equal(calls[0].headers["Accept-Encoding"], "identity");
  assert.equal(calls[0].headers["If-None-Match"], undefined);
});

test("conditional request: validators are sent and 304 → not-modified", async () => {
  const { transport, calls } = scriptedTransport([response(304)]);
  const result = await fetchIcsFeed(OUTLOOK_URL, {
    resolve: publicResolve,
    transport,
    etag: '"v1"',
    lastModified: "Mon, 26 Oct 2026 10:00:00 GMT",
  });
  assert.deepEqual(result, { status: "not-modified" });
  assert.equal(calls[0].headers["If-None-Match"], '"v1"');
  assert.equal(calls[0].headers["If-Modified-Since"], "Mon, 26 Oct 2026 10:00:00 GMT");
});

test("a redirect to http:// is refused", async () => {
  const { transport } = scriptedTransport([
    response(302, "", { location: "http://outlook.office365.com/calendar.ics" }),
  ]);
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, { resolve: publicResolve, transport }),
    isCode("BLOCKED_ADDRESS"),
  );
});

test("a redirect to a host resolving to a private address is refused", async () => {
  const { transport, calls } = scriptedTransport([
    response(301, "", { location: "https://internal.example/calendar.ics" }),
  ]);
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, {
      resolve: async (hostname) =>
        hostname === "internal.example"
          ? [{ address: "192.168.0.10", family: 4 }]
          : [{ address: "52.97.0.1", family: 4 }],
      transport,
    }),
    isCode("BLOCKED_ADDRESS"),
  );
  assert.equal(calls.length, 1);
});

test("a redirect to an IP literal in a private range is refused", async () => {
  const { transport } = scriptedTransport([
    response(307, "", { location: "https://169.254.169.254/latest/meta-data" }),
  ]);
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, { resolve: publicResolve, transport }),
    isCode("BLOCKED_ADDRESS"),
  );
});

test("valid redirects are followed (relative Location), at most 3", async () => {
  const ok = scriptedTransport([
    response(302, "", { location: "/owa/calendar/moved/calendar.ics" }),
    response(200, OUTLOOK_SAMPLE_ICS),
  ]);
  const result = await fetchIcsFeed(OUTLOOK_URL, { resolve: publicResolve, transport: ok.transport });
  assert.equal(result.status, "ok");
  assert.equal(ok.calls[1].url.pathname, "/owa/calendar/moved/calendar.ics");

  const loop = scriptedTransport(
    Array.from({ length: 4 }, (_, index) =>
      response(302, "", { location: `https://outlook.office365.com/hop${index}.ics` }),
    ),
  );
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, { resolve: publicResolve, transport: loop.transport }),
    isCode("TOO_MANY_REDIRECTS"),
  );
  assert.equal(loop.calls.length, 4);
});

test("Outlook's error page redirect reports the real status (link no longer published)", async () => {
  const { transport, calls } = scriptedTransport([
    response(302, "", {
      location: "https://outlook.office365.com/owa/calendar/errorFE.aspx?httpCode=404",
    }),
  ]);
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, { resolve: publicResolve, transport }),
    isCode("HTTP_STATUS", 404),
  );
  // The error page itself is never downloaded.
  assert.equal(calls.length, 1);
});

// --- several DNS answers (IPv6 first, broken IPv6 on the server) ----------------

test("every validated address is handed to the transport, IPv4 first", async () => {
  const { transport, calls } = scriptedTransport([response(200, OUTLOOK_SAMPLE_ICS)]);
  const result = await fetchIcsFeed(OUTLOOK_URL, {
    resolve: async () => [
      { address: "2a00:1450:4014:800::200e", family: 6 },
      { address: "142.251.209.14", family: 4 },
      { address: "2603:1026::1", family: 6 },
      { address: "142.251.209.14", family: 4 },
      { address: "52.97.0.1", family: 4 },
    ],
    transport,
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(calls[0].addresses, [
    { address: "142.251.209.14", family: 4 },
    { address: "52.97.0.1", family: 4 },
    { address: "2a00:1450:4014:800::200e", family: 6 },
    { address: "2603:1026::1", family: 6 },
  ]);
  assert.equal(calls[0].address, "142.251.209.14");
  assert.equal(calls[0].family, 4);
});

test("orderAddresses keeps IPv6-only answers", () => {
  assert.deepEqual(orderAddresses([{ address: "2603:1026::1", family: 6 }]), [
    { address: "2603:1026::1", family: 6 },
  ]);
});

test("pinnedLookup answers only with the validated addresses", () => {
  const addresses = [
    { address: "52.97.0.1", family: 4 },
    { address: "2603:1026::1", family: 6 },
  ];
  const lookup = pinnedLookup(addresses);
  const results: unknown[] = [];
  lookup("evil.example", { all: true }, (error, address) => results.push([error, address]));
  lookup("evil.example", {}, (error, address, family) => results.push([error, address, family]));
  lookup("evil.example", { all: true, family: 6 }, (error, address) =>
    results.push([error, address]),
  );
  lookup("evil.example", { family: 4 }, (error, address, family) =>
    results.push([error, address, family]),
  );
  assert.deepEqual(results, [
    [null, addresses],
    [null, "52.97.0.1", 4],
    [null, [{ address: "2603:1026::1", family: 6 }]],
    [null, "52.97.0.1", 4],
  ]);

  let failure: NodeJS.ErrnoException | null = null;
  pinnedLookup([{ address: "52.97.0.1", family: 4 }])("x", { family: 6 }, (error) => {
    failure = error;
  });
  assert.equal((failure as NodeJS.ErrnoException | null)?.code, "ENOTFOUND");
});

test("with pinnedLookup Node falls back to the next address when the first fails", async () => {
  // Local only: the server listens on 127.0.0.1; the first offered address
  // (::1, same port) refuses — like a dead IPv6 route to Outlook/Google.
  const server = net.createServer((socket) => socket.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const socket = net.connect({
        host: "calendar.example",
        port,
        autoSelectFamily: true,
        autoSelectFamilyAttemptTimeout: 250,
        lookup: pinnedLookup([
          { address: "::1", family: 6 },
          { address: "127.0.0.1", family: 4 },
        ]) as unknown as net.LookupFunction,
      });
      let received = "";
      socket.on("data", (chunk) => {
        received += chunk.toString();
      });
      socket.on("end", () => resolve(received));
      socket.on("error", reject);
    });
    assert.equal(data, "ok");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Content-Length over the limit → TOO_LARGE", async () => {
  const { transport } = scriptedTransport([
    response(200, "BEGIN:VCALENDAR", { "content-length": String(6 * 1024 * 1024) }),
  ]);
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, { resolve: publicResolve, transport }),
    isCode("TOO_LARGE"),
  );
});

test("a streamed body over the limit → TOO_LARGE", async () => {
  const chunk = new Uint8Array(1024 * 1024).fill(65);
  let destroyed = false;
  const big: TransportResponse = {
    ...response(200, Array.from({ length: 6 }, () => chunk)),
    destroy: () => {
      destroyed = true;
    },
  };
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, {
      resolve: publicResolve,
      transport: async () => big,
    }),
    isCode("TOO_LARGE"),
  );
  assert.equal(destroyed, true);
});

test("a hanging response hits the deadline → TIMEOUT", async () => {
  const hanging: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise<IteratorResult<Uint8Array>>(() => {}),
      };
    },
  };
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, {
      resolve: publicResolve,
      transport: async () => response(200, hanging),
      timeoutMs: 50,
    }),
    isCode("TIMEOUT"),
  );
  // A transport that never answers times out too.
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, {
      resolve: publicResolve,
      transport: () => new Promise(() => {}),
      timeoutMs: 50,
    }),
    isCode("TIMEOUT"),
  );
});

test("HTTP errors carry the status code", async () => {
  const { transport } = scriptedTransport([response(404, "Not found")]);
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, { resolve: publicResolve, transport }),
    isCode("HTTP_STATUS", 404),
  );
});

test("an HTML page instead of ICS → NOT_ICS", async () => {
  const { transport } = scriptedTransport([
    response(200, "<!doctype html><html><body>Outlook</body></html>", {
      "content-type": "text/html",
    }),
  ]);
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, { resolve: publicResolve, transport }),
    isCode("NOT_ICS"),
  );
});

test("transport failures map to NETWORK", async () => {
  await assert.rejects(
    fetchIcsFeed(OUTLOOK_URL, {
      resolve: publicResolve,
      transport: async () => {
        throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
      },
    }),
    isCode("NETWORK"),
  );
});

test("every error code has a Czech message without the URL", () => {
  for (const code of ICS_ERROR_CODES) {
    const message = icsErrorMessage(code, 404);
    assert.ok(message.length > 10, code);
    assert.ok(!message.includes("https://outlook"), code);
  }
  assert.match(icsErrorMessage("HTTP_STATUS", 404), /kódem 404/);
  assert.match(icsErrorMessage("NOT_HTTPS"), /musí začínat https:\/\//);
  assert.match(icsErrorMessage("BLOCKED_ADDRESS"), /neveřejnou adresu/);
});
