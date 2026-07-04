import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../api/api_client.dart';
import '../storage/auth_storage.dart';

/// Singleton-сервис для real-time коммуникации через WebSocket.
///
/// Подключается к бэку на `/realtime` namespace с JWT в auth.token
/// после логина. Переподключается автоматически при потере соединения.
///
/// Экспонирует два broadcast stream'а:
///   - `messageStream` — событие `message:new` с payload'ом ChatMessage
///   - `notificationStream` — событие `notification:new` с типом
///
/// Использование:
/// ```
/// await RealtimeService.instance.connect();
/// final sub = RealtimeService.instance.messageStream.listen((msg) { ... });
/// // ... на logout:
/// await RealtimeService.instance.disconnect();
/// ```
/// Состояние WebSocket-соединения для UI-индикации.
enum RealtimeStatus {
  disconnected, // не подключены (нет сессии или вручную выключено)
  connecting, // в процессе коннекта
  connected, // соединение установлено, real-time работает
  error, // connect error, будем пытаться переподключиться
}

class RealtimeService {
  RealtimeService._();
  static final RealtimeService instance = RealtimeService._();

  io.Socket? _socket;

  final _messageController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _notificationController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _statusController =
      StreamController<RealtimeStatus>.broadcast();

  RealtimeStatus _status = RealtimeStatus.disconnected;

  /// Stream новых сообщений от WebSocket. Все экраны чата подписываются
  /// на него и фильтруют по `conversationId`.
  Stream<Map<String, dynamic>> get messageStream => _messageController.stream;

  /// Stream уведомлений для обновления колокольчика в реальном времени.
  Stream<Map<String, dynamic>> get notificationStream =>
      _notificationController.stream;

  /// Stream изменений статуса соединения — для индикатора в AppBar.
  /// Broadcast, можно подписываться из нескольких мест.
  Stream<RealtimeStatus> get statusStream => _statusController.stream;

  RealtimeStatus get status => _status;
  bool get isConnected => _status == RealtimeStatus.connected;

  void _setStatus(RealtimeStatus s) {
    if (_status == s) return;
    _status = s;
    _statusController.add(s);
  }

  /// Подключиться к WS. Если уже подключены — no-op. Токен берётся из
  /// AuthStorage. Если токена нет — подключения не будет (возвращает false).
  Future<bool> connect() async {
    if (_socket != null && _socket!.connected) return true;

    String? token;
    try {
      token = await AuthStorage.instance.readAccessToken();
    } catch (_) {
      _setStatus(RealtimeStatus.disconnected);
      return false;
    }
    if (token == null || token.isEmpty) {
      _setStatus(RealtimeStatus.disconnected);
      return false;
    }

    // baseUrl + namespace. Для web → ws://localhost:3000/realtime,
    // для мобильных Android → через резолвер хоста.
    final baseWithoutApi = ApiClient.instance.staticBaseUrl;
    final url = '$baseWithoutApi/realtime';

    // Отключаем предыдущий если был
    _socket?.dispose();
    _setStatus(RealtimeStatus.connecting);

    _socket = io.io(
      url,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          .setAuth({'token': token})
          .setReconnectionAttempts(9999)
          .setReconnectionDelay(2000)
          .build(),
    );

    _socket!.onConnect((_) {
      _setStatus(RealtimeStatus.connected);
      // ignore: avoid_print
      print('[realtime] connected to $url');
    });
    _socket!.onDisconnect((reason) {
      _setStatus(RealtimeStatus.disconnected);
      // ignore: avoid_print
      print('[realtime] disconnected: $reason');
    });
    _socket!.onConnectError((err) {
      _setStatus(RealtimeStatus.error);
      // ignore: avoid_print
      print('[realtime] connect error: $err');
    });
    _socket!.onReconnectAttempt((_) {
      _setStatus(RealtimeStatus.connecting);
    });
    _socket!.on('message:new', (data) {
      if (data is Map) {
        _messageController.add(data.cast<String, dynamic>());
      }
    });
    _socket!.on('notification:new', (data) {
      if (data is Map) {
        _notificationController.add(data.cast<String, dynamic>());
      }
    });
    // Call signaling events (видеозвонки WebRTC). Все события идут
    // в messageStream с маркером `_type`, чтобы CallScreen мог фильтровать.
    for (final callEvent in [
      'call:offer',
      'call:answer',
      'call:ice',
      'call:hangup',
      'call:incoming',
    ]) {
      _socket!.on(callEvent, (data) {
        if (data is Map) {
          final m = data.cast<String, dynamic>();
          m['_type'] = callEvent;
          _messageController.add(m);
        }
      });
    }
    return true;
  }

  /// Отправить событие на сервер (signaling для видеозвонков и другие).
  void emit(String event, Map<String, dynamic> data) {
    final s = _socket;
    if (s != null && s.connected) {
      s.emit(event, data);
    }
  }

  /// Переподключиться с новым токеном (например после login/logout).
  Future<void> reconnect() async {
    await disconnect();
    await connect();
  }

  Future<void> disconnect() async {
    _socket?.dispose();
    _socket = null;
    _setStatus(RealtimeStatus.disconnected);
  }
}
