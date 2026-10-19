import assert from "node:assert/strict";
import { test } from "node:test";

import { isPublicPath } from "./public-paths";

test("isPublicPath: přihlášení, registrace, nastavení hesla a portál jsou veřejné", () => {
  for (const path of [
    "/login",
    "/register",
    "/set-password",
    "/portal",
    "/portal/login",
    "/set-password/",
  ]) {
    assert.equal(isPublicPath(path), true, path);
  }
});

test("isPublicPath: aplikace a podobně pojmenované cesty veřejné nejsou", () => {
  for (const path of [
    "/dashboard",
    "/settings",
    "/loginx",
    "/set-passwords",
    "/admin",
    "/join-organization",
    "/api/internal/notifications/run",
    "/",
  ]) {
    assert.equal(isPublicPath(path), false, path);
  }
});
