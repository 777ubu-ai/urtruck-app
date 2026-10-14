package com.urtruck.app

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class UrTruckNotificationBadgeModule(context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {
  override fun getName() = "UrTruckNotificationBadge"

  @ReactMethod
  fun setCanonicalCount(count: Double, observedBefore: Double, promise: Promise) {
    val valid = count.isFinite() && count >= 0 && count <= Int.MAX_VALUE &&
      count == count.toInt().toDouble() && observedBefore.isFinite() && observedBefore > 0
    val result = if (valid) try { UrTruckNotificationBadgeStore.canonical(
      reactApplicationContext, count.toInt(), observedBefore.toLong(),
    ) } catch (_: Exception) { BadgeResult(false, "native_badge_failed") }
      else BadgeResult(false, "invalid_badge")
    promise.resolve(Arguments.createMap().apply {
      putBoolean("applied", result.applied)
      putString("reason", result.reason)
    })
  }
}
