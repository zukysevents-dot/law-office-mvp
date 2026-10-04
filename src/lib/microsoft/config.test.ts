import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergeGraphConfig,
  mergeSharepointUrlConfig,
  type SharepointConfigRow,
} from "./config";

const EMPTY: SharepointConfigRow = {
  siteUrl: null,
  library: null,
  tenantId: null,
  clientId: null,
  clientSecret: null,
};

function row(patch: Partial<SharepointConfigRow>): SharepointConfigRow {
  return { ...EMPTY, ...patch };
}

const ENV = row({
  siteUrl: "https://env.sharepoint.com/sites/Env",
  library: "EnvKnihovna",
  tenantId: "env-tenant",
  clientId: "env-client",
  clientSecret: "env-secret",
});

test("mergeSharepointUrlConfig: bez řádku organizace se použije env", () => {
  assert.deepEqual(mergeSharepointUrlConfig(null, ENV), {
    siteUrl: "https://env.sharepoint.com/sites/Env",
    library: "EnvKnihovna",
  });
});

test("mergeSharepointUrlConfig: siteUrl organizace nikdy nepáruje s library z env", () => {
  // Skupina (siteUrl, library) se bere celá z org — jinak by knihovna z env
  // ukazovala na neexistující cestu na jiném webu.
  const result = mergeSharepointUrlConfig(
    row({ siteUrl: "https://org.sharepoint.com/sites/AK" }),
    ENV,
  );
  assert.deepEqual(result, {
    siteUrl: "https://org.sharepoint.com/sites/AK",
    library: "Dokumenty",
  });
});

test("mergeSharepointUrlConfig: ořízne koncová lomítka", () => {
  const result = mergeSharepointUrlConfig(
    row({ siteUrl: "https://org.sharepoint.com/sites/AK///", library: "Spisy" }),
    EMPTY,
  );
  assert.deepEqual(result, {
    siteUrl: "https://org.sharepoint.com/sites/AK",
    library: "Spisy",
  });
});

test("mergeSharepointUrlConfig: null, když web není nikde", () => {
  assert.equal(mergeSharepointUrlConfig(null, EMPTY), null);
  assert.equal(mergeSharepointUrlConfig(row({ siteUrl: "   " }), EMPTY), null);
});

test("mergeGraphConfig: kompletní trojice organizace vyhrává nad env", () => {
  const result = mergeGraphConfig(
    row({ tenantId: "t", clientId: "c", clientSecret: "s" }),
    ENV,
  );
  assert.deepEqual(result, {
    tenantId: "t",
    clientId: "c",
    clientSecret: "s",
  });
});

test("mergeGraphConfig: neúplná trojice organizace se NEMÍCHÁ s env", () => {
  // Chybějící secret (např. nerozšifrovatelný) → celá skupina padá na env,
  // nikdy tenantId kanceláře + clientSecret z env.
  const result = mergeGraphConfig(row({ tenantId: "t", clientId: "c" }), ENV);
  assert.deepEqual(result, {
    tenantId: "env-tenant",
    clientId: "env-client",
    clientSecret: "env-secret",
  });
});

test("mergeGraphConfig: null, když nejsou údaje nikde", () => {
  assert.equal(mergeGraphConfig(row({ tenantId: "t" }), EMPTY), null);
  assert.equal(mergeGraphConfig(null, EMPTY), null);
});

test("mergeGraphConfig: jen údaje organizace, web z env", () => {
  const graph = mergeGraphConfig(
    row({ tenantId: "t", clientId: "c", clientSecret: "s" }),
    ENV,
  );
  const url = mergeSharepointUrlConfig(
    row({ tenantId: "t", clientId: "c", clientSecret: "s" }),
    ENV,
  );
  assert.equal(graph?.tenantId, "t");
  assert.equal(url?.siteUrl, "https://env.sharepoint.com/sites/Env");
});
