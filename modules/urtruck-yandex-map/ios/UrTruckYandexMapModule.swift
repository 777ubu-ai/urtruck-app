import ExpoModulesCore
import CoreLocation
import UIKit
import YandexMapsMobile

private let mapSdkLock = NSLock()
private var mapSdkApiKey: String?

public final class UrTruckYandexMapView: ExpoView {
  // Yandex exposes this UIKit initializer as an implicitly-unwrapped optional
  // in its generated Swift interface. Keep the view strongly typed so Expo's
  // layout and map-window calls do not accidentally resolve to SwiftUI.Optional.
  private let mapView: YMKMapView = YMKMapView(frame: .zero)!
  private var mapObjects: YMKMapObjectCollection?
  private var marker: YMKPlacemarkMapObject?
  private var routeLine: YMKPolylineMapObject?
  private var didStartMapKit = false

  var apiKey: String?
  var latitude: Double = 0
  var longitude: Double = 0
  var zoom: Float = 10
  var title: String?
  var routeJSON: String?

  let onMapLoaded = EventDispatcher()
  let onMapError = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    addSubview(mapView)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    mapView.frame = bounds
  }

  func applyChanges() {
    guard CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: latitude, longitude: longitude)) else {
      onMapError(["code": "invalid_coordinates"])
      return
    }
    guard let apiKey, !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      onMapError(["code": "missing_api_key"])
      return
    }

    do {
      try startMapKitIfNeeded(apiKey: apiKey)
      if mapObjects == nil {
        mapObjects = mapView.mapWindow.map.mapObjects
      }
      let point = YMKPoint(latitude: latitude, longitude: longitude)
      let camera = YMKCameraPosition(target: point, zoom: zoom, azimuth: 0, tilt: 0)
      mapView.mapWindow.map.move(with: camera)
      updateMarker(at: point)
      updateRoute()
      onMapLoaded(["provider": "yandex_mapkit", "latitude": latitude, "longitude": longitude])
    } catch {
      onMapError(["code": "mapkit_init_failed", "message": error.localizedDescription])
    }
  }

  private func startMapKitIfNeeded(apiKey: String) throws {
    guard !didStartMapKit else { return }
    mapSdkLock.lock()
    defer { mapSdkLock.unlock() }
    if mapSdkApiKey == nil {
      YMKMapKit.setApiKey(apiKey)
      mapSdkApiKey = apiKey
      YMKMapKit.sharedInstance().onStart()
    }
    didStartMapKit = true
  }

  private func updateMarker(at point: YMKPoint) {
    guard let mapObjects else { return }
    if marker == nil {
      marker = mapObjects.addPlacemark(with: point)
      marker?.setIconWith(UIImage(systemName: "truck.box.fill") ?? UIImage())
    } else {
      marker?.geometry = point
    }
    marker?.setTextWithText(title ?? "UrTruck")
  }

  private func updateRoute() {
    // The route collection is owned by MapKit. Reuse the first line so GPS
    // prop updates never accumulate duplicate polylines.
    guard routeLine == nil else { return }
    guard let mapObjects, let routeJSON, let data = routeJSON.data(using: .utf8),
          let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
    let points = raw.compactMap { item -> YMKPoint? in
      guard let lat = item["lat"] as? Double else { return nil }
      let lon = (item["lng"] as? Double) ?? (item["lon"] as? Double)
      guard let lon else { return nil }
      return YMKPoint(latitude: lat, longitude: lon)
    }
    guard points.count > 1 else { return }
    routeLine = mapObjects.addPolyline(with: YMKPolyline(points: points))
    routeLine?.strokeWidth = 5
  }
}

public class UrTruckYandexMapModule: Module {
  public func definition() -> ModuleDefinition {
    Name("UrTruckYandexMap")

    View(UrTruckYandexMapView.self) {
      Prop("apiKey") { (view, value: String?) in view.apiKey = value }
      Prop("latitude") { (view, value: Double) in view.latitude = value }
      Prop("longitude") { (view, value: Double) in view.longitude = value }
      Prop("zoom") { (view, value: Double) in view.zoom = Float(value) }
      Prop("title") { (view, value: String?) in view.title = value }
      Prop("routeJSON") { (view, value: String?) in view.routeJSON = value }
      Events("onMapLoaded", "onMapError")
      OnViewDidUpdateProps { view in view.applyChanges() }
    }
  }
}
