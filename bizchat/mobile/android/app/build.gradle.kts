plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// FCM: google-services plugin применяется условно — только если в android/app/
// лежит google-services.json. Это позволяет собирать Android build даже без
// настроенного Firebase (graceful degradation). Файл кладётся через
// `flutterfire configure` или вручную с Firebase Console.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
    println("[FCM] google-services.json found — Firebase enabled for Android")
} else {
    println("[FCM] google-services.json missing — Android build skips Firebase init")
}

android {
    // FCM: namespace + applicationId должны совпадать с package_name из
    // android/app/google-services.json (`app.bizchat`). Если поменять — Gradle
    // plugin com.google.gms.google-services упадёт с "No matching client found".
    namespace = "app.bizchat"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "app.bizchat"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}
