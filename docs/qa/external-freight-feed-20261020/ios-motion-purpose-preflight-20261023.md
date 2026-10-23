# PRE-FLIGHT: iOS Apple90683

База b3823476b631519155d553595a1d0e8c58151363, веткаfix/ios-motion-purpose-20261023.
Артефакт109 загружен без ошибок транспорта, Apple processing FAIL90683: отсутствует NSMotionUsageDescription.
Установленный expo-location содержит CMMotionActivityManager и штатные motion API; вызовов этих API вsrc нет. Нативный Info.plist и app.json не содержали purpose, хотя текущий плагинSDK имеет такой контракт.
Меняются только iOS privacy metadata и проверка итогового IPA. Описание честно указывает отсутствие сбора в текущем приложении. Запросы разрешений, Motion/GPS, фоновые режимы и зависимости не добавляются.
Проверки: старый109 воспроизводит отказ локального artifact guard; новаяmetadata проходит; независимыйreview иCI; затем новыйiOS110. Androidb382 и готовыйAAB сохраняются: Android/runtimeкод не меняются.
