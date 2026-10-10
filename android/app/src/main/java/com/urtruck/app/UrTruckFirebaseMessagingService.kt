package com.urtruck.app

import android.content.Intent
import android.util.Log
import org.json.JSONObject
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

// Keep Expo token registration, FCM ACK, dedup, rendering and tap behavior.
// FCM renders notification+data in background without onMessageReceived.
class UrTruckFirebaseMessagingService : ExpoFirebaseMessagingService() {
  private fun oneSignalBadge(custom: String?): String? {
    if (custom.isNullOrBlank() || custom.length > 65536) return null
    return try { JSONObject(custom).optJSONObject("a")?.opt("badge")?.toString() }
    catch (_: Exception) { null }
  }

  private fun badgeFrom(intent: Intent): PushBadge? {
    if (intent.action != "com.google.android.c2dm.intent.RECEIVE") return null
    val message = RemoteMessage(intent.extras ?: return null)
    // Deployed gateway sends notification_count, not a custom data.badge.
    val count = UrTruckBadgePolicy.payloadCount(
      message.notification?.notificationCount, message.data["badge"] ?: oneSignalBadge(message.data["custom"]),
    ) ?: return null
    return PushBadge(count, message.sentTime, message.messageId ?: return null)
  }

  override fun handleIntent(intent: Intent) {
    val badge = try { badgeFrom(intent) } catch (_: Exception) { null }
    super.handleIntent(intent)
    if (badge == null) return
    val result = try { UrTruckNotificationBadgeStore.push(this, badge) }
      catch (_: Exception) { BadgeResult(false, "native_badge_failed") }
    Log.d("UrTruckBadge", "push badge applied=${result.applied} reason=${result.reason ?: "none"}")
  }
}
