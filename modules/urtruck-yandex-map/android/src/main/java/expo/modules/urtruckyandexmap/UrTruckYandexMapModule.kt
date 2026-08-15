package expo.modules.urtruckyandexmap

import android.content.Context
import android.graphics.Color
import com.yandex.mapkit.MapKitFactory
import com.yandex.mapkit.geometry.Point
import com.yandex.mapkit.geometry.Polyline
import com.yandex.mapkit.map.CameraPosition
import com.yandex.mapkit.map.MapObjectCollection
import com.yandex.mapkit.map.PlacemarkMapObject
import com.yandex.mapkit.map.PolylineMapObject
import com.yandex.mapkit.mapview.MapView
import com.yandex.runtime.image.ImageProvider
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

class UrTruckYandexMapView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val mapView = MapView(context)
  private var mapObjects: MapObjectCollection? = null
  private var marker: PlacemarkMapObject? = null
  private var routeLine: PolylineMapObject? = null
  private var mapKitStarted = false

  var apiKey: String? = null
  var latitude = 0.0
  var longitude = 0.0
  var zoom = 10.0
  var title: String? = null
  var routeJson: String? = null

  val onMapLoaded by EventDispatcher<Map<String, Any>>()
  val onMapError by EventDispatcher<Map<String, Any>>()

  init {
    orientation = VERTICAL
    addView(mapView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun applyChanges() {
    if (apiKey.isNullOrBlank()) {
      onMapError(mapOf("code" to "missing_api_key"))
      return
    }
    if (!mapKitStarted) {
      try {
        MapKitFactory.setApiKey(apiKey!!)
        MapKitFactory.initialize(context.applicationContext)
        MapKitFactory.getInstance().onStart()
        mapKitStarted = true
      } catch (error: Throwable) {
        onMapError(mapOf("code" to "mapkit_init_failed", "message" to (error.message ?: "unknown")))
        return
      }
    }
    if (mapObjects == null) mapObjects = mapView.mapWindow.map.mapObjects
    val point = Point(latitude, longitude)
    mapView.mapWindow.map.move(CameraPosition(point, zoom.toFloat(), 0f, 0f))
    updateMarker(point)
    updateRoute()
    onMapLoaded(mapOf("provider" to "yandex_mapkit", "latitude" to latitude, "longitude" to longitude))
  }

  private fun updateMarker(point: Point) {
    val objects = mapObjects ?: return
    if (marker == null) {
      marker = objects.addPlacemark(point)
      marker?.setIcon(ImageProvider.fromResource(context, expo.modules.urtruckyandexmap.R.drawable.urtruck_map_marker))
    } else {
      marker?.geometry = point
    }
  }

  private fun updateRoute() {
    if (routeLine != null || routeJson.isNullOrBlank()) return
    val raw = try { JSONArray(routeJson) } catch (_: Throwable) { return }
    val points = ArrayList<Point>()
    for (index in 0 until raw.length()) {
      val item = raw.optJSONObject(index) ?: continue
      val lat = item.optDouble("lat", Double.NaN)
      val lon = if (item.has("lng")) item.optDouble("lng", Double.NaN) else item.optDouble("lon", Double.NaN)
      if (!lat.isNaN() && !lon.isNaN()) points.add(Point(lat, lon))
    }
    if (points.size > 1) {
      routeLine = mapObjects?.addPolyline(Polyline(points))
      routeLine?.strokeWidth = 5f
      routeLine?.setStrokeColor(Color.rgb(0, 180, 120))
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    mapView.onStart()
  }

  override fun onDetachedFromWindow() {
    mapView.onStop()
    super.onDetachedFromWindow()
  }
}

class UrTruckYandexMapModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UrTruckYandexMap")

    View(UrTruckYandexMapView::class) {
      Prop("apiKey") { view: UrTruckYandexMapView, value: String? -> view.apiKey = value }
      Prop("latitude") { view: UrTruckYandexMapView, value: Double -> view.latitude = value }
      Prop("longitude") { view: UrTruckYandexMapView, value: Double -> view.longitude = value }
      Prop("zoom") { view: UrTruckYandexMapView, value: Double -> view.zoom = value }
      Prop("title") { view: UrTruckYandexMapView, value: String? -> view.title = value }
      Prop("routeJson") { view: UrTruckYandexMapView, value: String? -> view.routeJson = value }
      Events("onMapLoaded", "onMapError")
      OnViewDidUpdateProps { view: UrTruckYandexMapView -> view.applyChanges() }
    }
  }
}
