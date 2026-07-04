// Smoke-тест: приложение стартует и показывает заставку авторизации.
//
// Полные e2e тесты (регистрация, лента, роутинг) будут жить в
// integration_test/ после того как QA-агент напишет их в спринте 2.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bizchat/main.dart';

void main() {
  testWidgets('BizChatApp starts with auth gate', (WidgetTester tester) async {
    await tester.pumpWidget(const BizChatApp());

    // Первый кадр — _AuthGate показывает индикатор загрузки, пока
    // идёт проверка наличия сессии в secure storage.
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
