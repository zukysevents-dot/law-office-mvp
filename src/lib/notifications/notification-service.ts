export type NotificationPayload = {
  toUserId?: string | null;
  subject: string;
  body: string;
  entityType?: string;
  entityId?: string;
};

export async function queueInternalNotification(
  payload: NotificationPayload,
) {
  void payload;

  return {
    queued: false,
    reason: "EMAIL_NOTIFICATIONS_NOT_CONFIGURED",
  };
}
