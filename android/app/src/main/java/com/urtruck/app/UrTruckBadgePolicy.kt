package com.urtruck.app

internal data class PushBadge(val count: Int, val sentAt: Long, val messageId: String)

internal object UrTruckBadgePolicy {
  fun parseCount(value: Any?): Int? {
    val text = value as? String ?: return null
    if (!Regex("[0-9]{1,10}").matches(text)) return null
    return text.toIntOrNull()?.takeIf { it >= 0 }
  }

  fun payloadCount(notificationCount: Int?, dataBadge: String?): Int? =
    notificationCount?.takeIf { it >= 0 } ?: parseCount(dataBadge)

  fun shouldApplyPush(
    push: PushBadge,
    canonicalAt: Long,
    lastPushAt: Long,
    lastPushId: String,
    lastCount: Int,
  ): Boolean = push.sentAt > 0 && push.messageId.isNotBlank() &&
    push.messageId != lastPushId && push.sentAt > canonicalAt &&
    push.sentAt >= lastPushAt &&
    (push.sentAt != lastPushAt || push.count >= lastCount)
}
