package com.urtruck.app

import android.content.Context
import me.leolin.shortcutbadger.ShortcutBadgeException
import me.leolin.shortcutbadger.ShortcutBadger

internal data class BadgeResult(val applied: Boolean, val reason: String? = null)

internal object UrTruckNotificationBadgeStore {
  private fun prefs(context: Context) =
    context.getSharedPreferences("urtruck_notification_badge", Context.MODE_PRIVATE)

  private fun apply(context: Context, count: Int): BadgeResult = try {
    // Expo's Android zero helper calls cancelAll(). A badge change must never
    // delete another room's notification or a newer push.
    ShortcutBadger.applyCountOrThrow(context.applicationContext, count)
    BadgeResult(true)
  } catch (_: ShortcutBadgeException) {
    BadgeResult(false, "launcher_badge_unsupported")
  } catch (_: Exception) {
    BadgeResult(false, "native_badge_failed")
  }

  @Synchronized
  fun canonical(context: Context, count: Int, observedBefore: Long): BadgeResult {
    val p = prefs(context)
    if (observedBefore < p.getLong("canonicalAt", 0) ||
      observedBefore < p.getLong("pushAt", 0)) return BadgeResult(false, "superseded")
    val result = apply(context, count)
    // Remember the read snapshot even on an unsupported launcher; an old FCM
    // must not resurrect a count after the app has reconciled a newer snapshot.
    p.edit().putLong("canonicalAt", observedBefore).putInt("count", count).apply()
    return result
  }

  @Synchronized
  fun push(context: Context, badge: PushBadge): BadgeResult {
    val p = prefs(context)
    if (!UrTruckBadgePolicy.shouldApplyPush(
      badge, p.getLong("canonicalAt", 0), p.getLong("pushAt", 0),
      p.getString("pushId", "") ?: "", p.getInt("count", 0),
    )) return BadgeResult(false, "superseded")
    val result = apply(context, badge.count)
    p.edit().putLong("pushAt", badge.sentAt).putString("pushId", badge.messageId)
      .putInt("count", badge.count).apply()
    return result
  }
}
