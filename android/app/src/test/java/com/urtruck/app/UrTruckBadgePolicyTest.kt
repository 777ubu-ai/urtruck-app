package com.urtruck.app

import org.junit.Assert.*
import org.junit.Test

class UrTruckBadgePolicyTest {
  @Test fun onlyCanonicalNonnegativeIntegerPayloadsAreAccepted() {
    assertEquals(15, UrTruckBadgePolicy.parseCount("15"))
    assertEquals(0, UrTruckBadgePolicy.parseCount("0"))
    for (bad in listOf(null, "-1", "NaN", "1.5", "2147483648", " 15", ""))
      assertNull(UrTruckBadgePolicy.parseCount(bad))
  }

  @Test fun deployedNotificationCountWorksWithoutCustomBadgeData() {
    assertEquals(15, UrTruckBadgePolicy.payloadCount(15, null))
    assertEquals(15, UrTruckBadgePolicy.payloadCount(15, "12"))
    assertEquals(0, UrTruckBadgePolicy.payloadCount(null, "0"))
    assertNull(UrTruckBadgePolicy.payloadCount(null, "NaN"))
  }

  @Test fun readSnapshotProtectsAgainstDelayedPreReadPush() {
    assertFalse(UrTruckBadgePolicy.shouldApplyPush(PushBadge(15, 100, "old"), 101, 0, "", 12))
    assertTrue(UrTruckBadgePolicy.shouldApplyPush(PushBadge(13, 102, "new"), 101, 0, "", 12))
  }

  @Test fun replayNeverIncrementsOrRestoresAnOlderBadge() {
    assertFalse(UrTruckBadgePolicy.shouldApplyPush(PushBadge(15, 100, "same"), 0, 100, "same", 15))
    assertFalse(UrTruckBadgePolicy.shouldApplyPush(PushBadge(14, 99, "old"), 0, 100, "latest", 15))
    assertFalse(UrTruckBadgePolicy.shouldApplyPush(PushBadge(14, 100, "reordered"), 0, 100, "latest", 15))
    assertTrue(UrTruckBadgePolicy.shouldApplyPush(PushBadge(16, 101, "new"), 0, 100, "latest", 15))
  }

  @Test fun MissingTimestampOrMessageIdNeverChangesBadge() {
    assertFalse(UrTruckBadgePolicy.shouldApplyPush(PushBadge(1, 0, "id"), 0, 0, "", 0))
    assertFalse(UrTruckBadgePolicy.shouldApplyPush(PushBadge(1, 100, ""), 0, 0, "", 0))
  }
}
