// ISDS (datové schránky) integration boundary. The real provider (official ISDS
// API vs a partner like EXevido) is an open decision (ROADMAP §7), so everything
// goes through this interface. MVP ships a stub (no network); the real client
// plugs in behind getIsdsClient() later without touching the actions.

export type IsdsRawMessage = {
  dmId: string;
  direction: "IN" | "OUT";
  senderBoxId?: string | null;
  recipientBoxId?: string | null;
  messageSubject: string;
  deliveredAt?: Date | null;
};

export type IsdsSendInput = {
  fromBoxId: string;
  recipientBoxId: string;
  messageSubject: string;
};

// Discriminated result (no throw) so server actions can surface a real Czech
// message — mirrors AresFetchResult.
export type IsdsResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_configured" }
  | { status: "error"; message: string };

export interface IsdsClient {
  listInboxMessages(boxId: string): Promise<IsdsResult<IsdsRawMessage[]>>;
  sendMessage(input: IsdsSendInput): Promise<IsdsResult<{ dmId: string }>>;
}
