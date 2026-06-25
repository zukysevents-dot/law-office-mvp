import type { IsdsClient } from "./types";

// MVP stub: never touches the network. Until a real ISDS provider is chosen it
// reports "not_configured", so syncInbox/sendMessage tell the user to use manual
// entry rather than silently doing nothing.
export const stubIsdsClient: IsdsClient = {
  async listInboxMessages() {
    return { status: "not_configured" };
  },
  async sendMessage() {
    return { status: "not_configured" };
  },
};
