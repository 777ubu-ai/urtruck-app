Pod::Spec.new do |s|
  s.name           = 'UrTruckYandexMap'
  s.version        = '1.0.0'
  s.summary        = 'Native Yandex MapKit view for UrTruck'
  s.description    = 'Expo Modules bridge that embeds Yandex MapKit in the UrTruck tracking screen.'
  s.author         = 'UrTruck'
  s.homepage       = 'https://urtruck.kz'
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'YandexMapsMobile', '4.42.0-lite'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
