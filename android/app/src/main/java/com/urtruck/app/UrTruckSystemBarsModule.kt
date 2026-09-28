package com.urtruck.app

import android.graphics.Color
import android.view.View
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class UrTruckSystemBarsModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "UrTruckSystemBars"

  @ReactMethod
  fun setLaunchMode(enabled: Boolean) {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread {
      val window = activity.window
      val controller = WindowCompat.getInsetsController(window, window.decorView)

      if (enabled) {
        window.navigationBarColor = Color.TRANSPARENT
        controller.isAppearanceLightNavigationBars = false
        controller.hide(WindowInsetsCompat.Type.navigationBars())
        controller.systemBarsBehavior =
          androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      } else {
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
        controller.show(WindowInsetsCompat.Type.navigationBars())
        window.navigationBarColor = Color.WHITE
        controller.isAppearanceLightNavigationBars = true
      }
    }
  }
}
