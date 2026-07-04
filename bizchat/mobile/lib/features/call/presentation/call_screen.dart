import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../../../core/realtime/realtime_service.dart';

/// Экран видеозвонка с кнопками управления (BUG-9).
///
/// MVP реализация peer-to-peer WebRTC:
/// - getUserMedia() для локальной камеры
/// - RTCPeerConnection с публичными STUN серверами Google
/// - Signaling через Socket.io (offer/answer/ice через RealtimeService)
/// - Кнопки: mute, video on/off, switch front/back, hangup
///
/// Вызывается с isIncoming: true при входящем звонке (offer пришёл по WS)
/// или с isIncoming: false при исходящем (юзер нажал кнопку звонка в чате).
class CallScreen extends StatefulWidget {
  const CallScreen({
    super.key,
    required this.conversationId,
    required this.partnerName,
    this.partnerAvatarUrl,
    this.isIncoming = false,
    this.initialOffer,
  });

  final String conversationId;
  final String partnerName;
  final String? partnerAvatarUrl;
  final bool isIncoming;
  /// Initial offer SDP для incoming звонков — приходит из main_shell
  /// глобального listener'а. CallScreen сразу применит его как remote description.
  final Map<String, dynamic>? initialOffer;

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  final _localRenderer = RTCVideoRenderer();
  final _remoteRenderer = RTCVideoRenderer();

  RTCPeerConnection? _pc;
  MediaStream? _localStream;

  bool _micMuted = false;
  bool _cameraOff = false;
  bool _usingFrontCamera = true;
  bool _connecting = true;
  bool _connected = false;
  String _statusText = 'Соединение...';

  StreamSubscription<Map<String, dynamic>>? _wsSub;
  Timer? _callTimer;
  int _callDurationSec = 0;

  @override
  void initState() {
    super.initState();
    _initCall();
  }

  Future<void> _initCall() async {
    await _localRenderer.initialize();
    await _remoteRenderer.initialize();

    // Подписка на signaling через WebSocket. RealtimeService пробрасывает
    // все события — мы фильтруем только call-related для нашего conversationId.
    _wsSub = RealtimeService.instance.messageStream.listen(_onSignaling);

    try {
      // Локальное медиа — камера + микрофон
      final stream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': {
          'facingMode': 'user', // front camera по умолчанию
          'width': 640,
          'height': 480,
        },
      });
      _localStream = stream;
      _localRenderer.srcObject = stream;

      // WebRTC peer connection с публичными STUN Google (бесплатные)
      final pc = await createPeerConnection({
        'iceServers': [
          {'urls': 'stun:stun.l.google.com:19302'},
          {'urls': 'stun:stun1.l.google.com:19302'},
        ],
      });
      _pc = pc;

      // Добавляем треки локальной камеры/микрофона
      for (final track in stream.getTracks()) {
        await pc.addTrack(track, stream);
      }

      // Приходит удалённый трек от собеседника
      pc.onTrack = (event) {
        if (event.streams.isNotEmpty) {
          _remoteRenderer.srcObject = event.streams.first;
          if (mounted) {
            setState(() {
              _connected = true;
              _statusText = 'Соединено';
            });
            _startCallTimer();
          }
        }
      };

      // ICE кандидаты — отправляем партнёру через WS
      pc.onIceCandidate = (candidate) {
        RealtimeService.instance.emit('call:ice', {
          'conversationId': widget.conversationId,
          'candidate': candidate.toMap(),
        });
      };

      pc.onConnectionState = (state) {
        if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
          if (mounted) {
            setState(() {
              _connected = true;
              _statusText = 'Соединено';
            });
            _startCallTimer();
          }
        } else if (state ==
                RTCPeerConnectionState.RTCPeerConnectionStateDisconnected ||
            state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
          if (mounted) {
            setState(() => _statusText = 'Соединение потеряно');
          }
        }
      };

      if (!widget.isIncoming) {
        // Исходящий звонок: создаём offer и отправляем партнёру
        final offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        RealtimeService.instance.emit('call:offer', {
          'conversationId': widget.conversationId,
          'sdp': offer.sdp,
          'type': offer.type,
        });
        if (mounted) {
          setState(() {
            _connecting = true;
            _statusText = 'Вызов...';
          });
        }
      } else if (widget.initialOffer != null) {
        // Входящий звонок: сразу применяем offer и создаём answer
        final offer = widget.initialOffer!;
        await pc.setRemoteDescription(
          RTCSessionDescription(
            offer['sdp'] as String?,
            offer['type'] as String?,
          ),
        );
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        RealtimeService.instance.emit('call:answer', {
          'conversationId': widget.conversationId,
          'sdp': answer.sdp,
          'type': answer.type,
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _connecting = false;
          _statusText = 'Не удалось запустить камеру: $e';
        });
      }
    }
  }

  void _onSignaling(Map<String, dynamic> data) async {
    final type = data['_type'] as String?;
    final convId = data['conversationId'] as String?;
    if (convId != widget.conversationId) return;
    final pc = _pc;
    if (pc == null) return;

    if (type == 'call:offer' && widget.isIncoming) {
      await pc.setRemoteDescription(
        RTCSessionDescription(
          data['sdp'] as String?,
          data['type'] as String?,
        ),
      );
      final answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      RealtimeService.instance.emit('call:answer', {
        'conversationId': widget.conversationId,
        'sdp': answer.sdp,
        'type': answer.type,
      });
    } else if (type == 'call:answer' && !widget.isIncoming) {
      await pc.setRemoteDescription(
        RTCSessionDescription(
          data['sdp'] as String?,
          data['type'] as String?,
        ),
      );
    } else if (type == 'call:ice') {
      final cand = data['candidate'] as Map<String, dynamic>?;
      if (cand != null) {
        await pc.addCandidate(
          RTCIceCandidate(
            cand['candidate'] as String?,
            cand['sdpMid'] as String?,
            cand['sdpMLineIndex'] as int?,
          ),
        );
      }
    } else if (type == 'call:hangup') {
      _hangup(notifyPartner: false);
    }
  }

  void _startCallTimer() {
    _callTimer?.cancel();
    _callTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _callDurationSec++);
    });
  }

  String _formatDuration() {
    final m = (_callDurationSec ~/ 60).toString().padLeft(2, '0');
    final s = (_callDurationSec % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  // === Управление звонком ===

  void _toggleMic() {
    final stream = _localStream;
    if (stream == null) return;
    final audioTracks = stream.getAudioTracks();
    if (audioTracks.isEmpty) return;
    setState(() {
      _micMuted = !_micMuted;
      for (final t in audioTracks) {
        t.enabled = !_micMuted;
      }
    });
  }

  void _toggleCamera() {
    final stream = _localStream;
    if (stream == null) return;
    final videoTracks = stream.getVideoTracks();
    if (videoTracks.isEmpty) return;
    setState(() {
      _cameraOff = !_cameraOff;
      for (final t in videoTracks) {
        t.enabled = !_cameraOff;
      }
    });
  }

  Future<void> _switchCamera() async {
    final stream = _localStream;
    if (stream == null) return;
    final videoTracks = stream.getVideoTracks();
    if (videoTracks.isEmpty) return;
    try {
      await Helper.switchCamera(videoTracks.first);
      setState(() => _usingFrontCamera = !_usingFrontCamera);
    } catch (_) {/* некоторые устройства не поддерживают — игнорируем */}
  }

  Future<void> _hangup({bool notifyPartner = true}) async {
    if (notifyPartner) {
      RealtimeService.instance.emit('call:hangup', {
        'conversationId': widget.conversationId,
      });
    }
    _callTimer?.cancel();
    _wsSub?.cancel();
    await _pc?.close();
    _pc = null;
    final stream = _localStream;
    if (stream != null) {
      for (final t in stream.getTracks()) {
        await t.stop();
      }
      await stream.dispose();
      _localStream = null;
    }
    if (mounted) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _callTimer?.cancel();
    _wsSub?.cancel();
    _pc?.close();
    _localStream?.getTracks().forEach((t) => t.stop());
    _localRenderer.dispose();
    _remoteRenderer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Remote video (fullscreen)
            if (_connected)
              RTCVideoView(
                _remoteRenderer,
                objectFit:
                    RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
              )
            else
              Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CircleAvatar(
                      radius: 60,
                      backgroundColor: Colors.grey.shade800,
                      backgroundImage: widget.partnerAvatarUrl != null
                          ? NetworkImage(widget.partnerAvatarUrl!)
                          : null,
                      child: widget.partnerAvatarUrl == null
                          ? Text(
                              widget.partnerName.isNotEmpty
                                  ? widget.partnerName[0].toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                fontSize: 48,
                                color: Colors.white,
                              ),
                            )
                          : null,
                    ),
                    const SizedBox(height: 24),
                    Text(
                      widget.partnerName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _statusText,
                      style: TextStyle(
                        color: Colors.grey.shade400,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
              ),

            // Local video preview (PiP сверху справа)
            Positioned(
              top: 16,
              right: 16,
              child: Container(
                width: 120,
                height: 160,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white24, width: 1),
                ),
                clipBehavior: Clip.antiAlias,
                child: _cameraOff
                    ? Container(
                        color: Colors.grey.shade900,
                        child: const Icon(Icons.videocam_off,
                            color: Colors.white54, size: 40),
                      )
                    : RTCVideoView(
                        _localRenderer,
                        mirror: _usingFrontCamera,
                        objectFit: RTCVideoViewObjectFit
                            .RTCVideoViewObjectFitCover,
                      ),
              ),
            ),

            // Статус звонка сверху (когда connected)
            if (_connected)
              Positioned(
                top: 20,
                left: 0,
                right: 0,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${widget.partnerName} • ${_formatDuration()}',
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ),

            // Панель управления внизу
            Positioned(
              bottom: 32,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _CallButton(
                    icon: _micMuted ? Icons.mic_off : Icons.mic,
                    label: _micMuted ? 'Вкл звук' : 'Выкл звук',
                    onTap: _toggleMic,
                    backgroundColor: _micMuted
                        ? Colors.white
                        : Colors.white.withValues(alpha: 0.2),
                    iconColor: _micMuted ? Colors.black : Colors.white,
                  ),
                  _CallButton(
                    icon: _cameraOff ? Icons.videocam_off : Icons.videocam,
                    label: _cameraOff ? 'Вкл видео' : 'Выкл видео',
                    onTap: _toggleCamera,
                    backgroundColor: _cameraOff
                        ? Colors.white
                        : Colors.white.withValues(alpha: 0.2),
                    iconColor: _cameraOff ? Colors.black : Colors.white,
                  ),
                  _CallButton(
                    icon: Icons.cameraswitch,
                    label: 'Камера',
                    onTap: _switchCamera,
                    backgroundColor: Colors.white.withValues(alpha: 0.2),
                    iconColor: Colors.white,
                  ),
                  _CallButton(
                    icon: Icons.call_end,
                    label: 'Завершить',
                    onTap: () => _hangup(),
                    backgroundColor: Colors.red,
                    iconColor: Colors.white,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CallButton extends StatelessWidget {
  const _CallButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.backgroundColor,
    required this.iconColor,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color backgroundColor;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: backgroundColor,
          shape: const CircleBorder(),
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Icon(icon, color: iconColor, size: 28),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: const TextStyle(color: Colors.white, fontSize: 12),
        ),
      ],
    );
  }
}
