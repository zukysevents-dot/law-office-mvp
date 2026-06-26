import { stubIsdsClient } from "./stub-client";
import type { IsdsClient } from "./types";

// Factory for the ISDS client. The real provider (official API / partner) plugs
// in here once decided (ROADMAP §7); until then we always return the stub, so no
// action depends on a concrete provider.
export function getIsdsClient(): IsdsClient {
  return stubIsdsClient;
}

export type { IsdsClient } from "./types";
