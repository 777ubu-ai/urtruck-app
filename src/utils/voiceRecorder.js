// Запись и воспроизведение голосовых сообщений через expo-av
// Web: MediaRecorder API с audio/mp4 fallback
// Native: expo-av Audio.Recording
//
// Плеер (28.08.2026, WhatsApp/WeChat-паритет по заявке владельца): один
// активный трек на всё приложение, play/pause/resume, seek по прогрессу,
// скорость 1x/1.5x/2x, живой прогресс в UI через subscribe(). Раньше был
// только play() без остановки: повторный тап по играющему сообщению делал
// `return true` (ничего), пауза отсутствовала физически.

import { Platform } from 'react-native';

// §8 канон UrTruck: максимальная длительность одного голосового — 60 секунд.
// На 60-й секунде запись автоматически финализируется и отправляется, второй
// раз Send нажимать не нужно. Экспортируется, чтобы UI и тесты брали ОДНО
// значение (никаких магических 60 в разных местах).
export const MAX_VOICE_DURATION_SEC = 60;

// §9: явный РЕЧЕВОЙ профиль записи вместо Audio.RecordingOptionsPresets
// .HIGH_QUALITY.
//
// HIGH_QUALITY в expo-av 15 — это 44100 Hz, СТЕРЕО, 128 kbps (см.
// node_modules/expo-av/build/Audio/RecordingConstants.js). Для музыки это
// нормально, для речи избыточно в разы: именно поэтому длинное голосовое
// упиралось в серверный потолок (POST /chat/voice отклоняет >10 MB,
// api/chat.py:820) и пользователь получал 413 вместо отправки.
//
// Речевой профиль: AAC в .m4a, 22050 Hz, МОНО, 48 kbps ⇒ ~6 KB/с, то есть
// 60-секундное сообщение ≈ 360 KB — на порядок ниже серверного лимита при
// полностью разборчивом голосе. Контейнер и расширение .m4a не меняются,
// поэтому загрузка, MIME и воспроизведение остаются прежними.
const VOICE_RECORDING_OPTIONS = {
  isMeteringEnabled: false,
  android: {
    extension: '.m4a',
    outputFormat: 2,   // AndroidOutputFormat.MPEG_4
    audioEncoder: 3,   // AndroidAudioEncoder.AAC
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 48000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'mp4a',  // IOSOutputFormat.MPEG4AAC
    audioQuality: 64,      // IOSAudioQuality.MEDIUM
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 48000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 48000,
  },
};

let _recording = null;
let _sound = null;
let _webAudio = null;
let _playingUri = null;
let _playPromise = null;
let _webTick = null;

// Состояние активного трека + подписчики (UI бабла голосового).
const _listeners = new Set();
let _state = { uri: null, isPlaying: false, positionMillis: 0, durationMillis: 0, rate: 1 };

const _snapshot = () => ({ ..._state });

const _emit = () => {
  const snap = _snapshot();
  _listeners.forEach((l) => { try { l(snap); } catch { /* один плохой подписчик не ломает остальных */ } });
};

const _setState = (patch) => {
  _state = { ..._state, ...patch };
  _emit();
};

// Скорость сохраняется между треками (как в WhatsApp), позиция — нет.
const _resetState = () => _setState({ uri: null, isPlaying: false, positionMillis: 0, durationMillis: 0 });

export const voice = {
  // ─── Запись ───
  async startRecording() {
    if (Platform.OS === 'web') {
      return this._startWeb();
    }
    try {
      const { Audio } = require('expo-av');
      // Явно запрашиваем доступ к микрофону — без этого iOS не показывает диалог
      // разрешения и запись падает («Нужен доступ к микрофону»). NSMicrophone-
      // UsageDescription уже прописан в app.json (нужна пересборка build 39).
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        console.warn('[voice] microphone permission not granted');
        return false;
      }

      // P1-VOICE-001 (nightly 04.09.2026, repro 2/2, ранее targeted PASS).
      // voiceRecorder — модульный singleton, общий на 5 точек (ChatScreen,
      // DealWorkspaceScreen, DealWorkspaceScreenV2, оба VoiceMessageBubble).
      // Запись и воспроизведение делят ОДИН Android AudioManager. Раньше
      // startRecording захватывал микрофон, НЕ заглушив активный плеер:
      // после «проиграть голосовое → записать новое» (ровно ночной сценарий,
      // которого не было на чистом retest) живой Audio.Sound держал
      // аудио-сессию, и последующий stopAndUnloadAsync() реджектил → stop
      // возвращал { uri: null } → sender bubble не появлялся, backend-
      // сообщение не создавалось. Единственная точка владения аудио-сессией:
      // ПЕРЕД захватом микрофона глушим любой playback.
      try { await this.stop(); } catch { /* нет активного playback — не критично */ }

      // Защита от stale-рекордера: expo-av допускает лишь один
      // подготовленный Recording одновременно. Если прошлый объект по любой
      // причине остался висеть (реджект stop, чужой cleanup не добежал),
      // createAsync бросил бы «Only one Recording object can be prepared at
      // a given time» — снимаем его до создания нового.
      if (_recording) {
        try { await _recording.stopAndUnloadAsync(); } catch { /* уже выгружен */ }
        _recording = null;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      // §9: речевой профиль (22050/моно/48k AAC) вместо HIGH_QUALITY
      // (44100/стерео/128k) — см. VOICE_RECORDING_OPTIONS выше.
      const { recording } = await Audio.Recording.createAsync(VOICE_RECORDING_OPTIONS);
      _recording = recording;
      return true;
    } catch (e) {
      console.warn('[voice] start failed:', e);
      // Гарантируем чистое состояние singleton при любом сбое старта —
      // иначе следующая попытка записи унаследует полудохлый рекордер.
      _recording = null;
      return false;
    }
  },

  // P0 2026-09-03 (диагностируемость): раньше ЛЮБОЙ отказ схлопывался в
  // `null`, вызывающий код видел только `!result?.uri` и показывал один
  // генерик-тост. Физически это выглядело как «нажал стоп — бабл не
  // появился», и первопричину нельзя было отличить от других без logcat.
  // Теперь отказ возвращает { uri: null, error, message } — контракт
  // `!result?.uri` для существующих вызывающих сохранён, но причина
  // доступна и её можно показать/залогировать/протестировать.
  async stopRecording() {
    if (Platform.OS === 'web') {
      return this._stopWeb();
    }
    // Активной записи нет. Основной сценарий: её уже разгрузил чужой
    // cleanup (уход с экрана / повторный релиз кнопки), поэтому это НЕ
    // «ошибка микрофона» и должно отличаться в UI.
    if (!_recording) {
      console.warn('[voice] stop: no active recording');
      return { uri: null, error: 'no_active_recording' };
    }
    const rec = _recording;
    // Ссылку снимаем СРАЗУ: expo-av допускает только один подготовленный
    // Recording одновременно (Recording.js: 'Only one Recording object can
    // be prepared at a given time'), и висящий объект после сбоя stop()
    // отравлял все последующие записи в сессии приложения.
    _recording = null;
    try {
      // stopAndUnloadAsync() сам возвращает финальный статус с
      // durationMillis — берём его, а getStatusAsync() оставляем
      // резервом (после unload он не бросает, отдаёт _finalDurationMillis).
      const stopStatus = await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      let durationMillis = stopStatus?.durationMillis;
      if (!durationMillis) {
        try {
          const status = await rec.getStatusAsync();
          durationMillis = status?.durationMillis || 0;
        } catch { durationMillis = 0; }
      }
      if (!uri) {
        console.warn('[voice] stop: no uri after unload');
        return { uri: null, error: 'no_uri' };
      }
      return { uri, duration: Math.round((durationMillis || 0) / 1000) };
    } catch (e) {
      // Реальный кейс Android: слишком короткая запись — нативный
      // stopAudioRecording() отклоняется, и stopAndUnloadAsync() реджектит.
      console.warn('[voice] stop failed:', e);
      return { uri: null, error: 'stop_failed', message: String(e?.message || e) };
    }
  },

  // ─── Воспроизведение ───
  //
  // Единый активный трек: старт нового голосового автоматически глушит
  // предыдущее (как в WhatsApp — два голосовых никогда не играют разом).
  // UI подписывается через voice.subscribe() и получает {uri, isPlaying,
  // positionMillis, durationMillis, rate} на каждом тике (~80мс).

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    _listeners.add(listener);
    try { listener(_snapshot()); } catch { /* подписчик не должен ронять плеер */ }
    return () => { _listeners.delete(listener); };
  },

  getState() {
    return _snapshot();
  },

  /** Тап по кнопке в бабле: играет / ставит на паузу / возобновляет. */
  async toggle(uri) {
    if (!uri) return false;
    if (_playingUri === uri) {
      return _state.isPlaying ? this.pause() : this.resume();
    }
    return this.play(uri);
  },

  async pause() {
    try {
      if (Platform.OS === 'web') {
        if (_webAudio) _webAudio.pause();
      } else if (_sound) {
        await _sound.pauseAsync();
      }
      _setState({ isPlaying: false });
      return true;
    } catch (e) {
      console.warn('[voice] pause failed:', e);
      return false;
    }
  },

  async resume() {
    try {
      if (Platform.OS === 'web') {
        if (!_webAudio) return this.play(_playingUri);
        await _webAudio.play();
      } else {
        if (!_sound) return this.play(_playingUri);
        await _sound.playAsync();
      }
      _setState({ isPlaying: true });
      return true;
    } catch (e) {
      console.warn('[voice] resume failed:', e);
      return false;
    }
  },

  /** Перемотка внутри активного трека (тап/драг по полосе прогресса). */
  async seek(uri, positionMillis) {
    if (!uri || _playingUri !== uri) return false;
    const pos = Math.max(0, Math.round(positionMillis || 0));
    try {
      if (Platform.OS === 'web') {
        if (!_webAudio) return false;
        _webAudio.currentTime = pos / 1000;
      } else {
        if (!_sound) return false;
        await _sound.setPositionAsync(pos);
      }
      _setState({ positionMillis: pos });
      return true;
    } catch (e) {
      console.warn('[voice] seek failed:', e);
      return false;
    }
  },

  /** Скорость воспроизведения (WhatsApp: 1x → 1.5x → 2x). */
  async setRate(rate) {
    const r = Number(rate) || 1;
    try {
      if (Platform.OS === 'web') {
        if (_webAudio) _webAudio.playbackRate = r;
      } else if (_sound) {
        // shouldCorrectPitch: голос не превращается в «бурундука».
        await _sound.setRateAsync(r, true);
      }
      _setState({ rate: r });
      return true;
    } catch (e) {
      console.warn('[voice] setRate failed:', e);
      return false;
    }
  },

  async play(uri) {
    if (!uri) return false;
    if (_playingUri === uri) {
      if (Platform.OS === 'web' && _webAudio && !_webAudio.paused && !_webAudio.ended) return true;
      if (_sound) {
        try {
          const status = await _sound.getStatusAsync();
          if (status?.isLoaded && status.isPlaying) return true;
        } catch { /* stale sound, fall through and recreate */ }
      }
      if (_playPromise) return _playPromise;
    }

    const run = (async () => {
      if (Platform.OS === 'web') {
        return this._playWeb(uri);
      }

    try {
      if (_sound) {
        // P0 2026-09-03: здесь стоял `if (_playResolve) { _playResolve(false) }`,
        // но переменная `_playResolve` НИКОГДА не объявлялась. Модуль — ES
        // module (всегда strict mode), поэтому чтение необъявленной
        // переменной бросает ReferenceError. Это происходило на КАЖДОМ
        // втором воспроизведении (когда `_sound` уже установлен), ошибка
        // глушилась внешним catch → `[voice] play failed` + return false:
        // плеер молча умирал после первого голосового.
        // Дедупликация параллельных play() и так делается через _playPromise
        // выше, отдельный resolve-хук не нужен — блок удалён целиком.
        await _sound.unloadAsync();
        _sound = null;
      }
      const { Audio } = require('expo-av');
      // C1 (device-баг): голосовое не проигрывалось у получателя на iOS.
      // Первопричина — после записи audio-сессия остаётся в режиме записи
      // (allowsRecordingIOS: true, выставлен в startRecording), и на iOS
      // воспроизведение в этом режиме молчит/падает. А тот, кто только слушает
      // (никогда не писал), играет в дефолтном режиме → в «бесшумном» режиме
      // телефона тоже тишина. Перед воспроизведением явно переводим сессию в
      // playback-режим: запись выключена, звук идёт даже в silent-mode.
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      } catch { /* не критично — пытаемся играть в текущем режиме */ }
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        // progressUpdateIntervalMillis: полоса прогресса и таймер в бабле
        // должны идти плавно, как в WhatsApp; дефолт (500мс) даёт рывки.
        { shouldPlay: true, progressUpdateIntervalMillis: 80, rate: _state.rate, shouldCorrectPitch: true },
      );
      _sound = sound;
      _playingUri = uri;
      _setState({ uri, isPlaying: true, positionMillis: 0, durationMillis: 0 });
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status?.isLoaded) return;
        if (_sound !== sound) return;
        if (status.didJustFinish) {
          // WhatsApp: по окончании трек сбрасывается в начало, кнопка снова
          // «play» — но НЕ выгружаем звук, чтобы повторный тап играл сразу.
          sound.setPositionAsync(0).catch(() => {});
          sound.pauseAsync().catch(() => {});
          _setState({ isPlaying: false, positionMillis: 0 });
          return;
        }
        _setState({
          uri,
          isPlaying: !!status.isPlaying,
          positionMillis: status.positionMillis || 0,
          durationMillis: status.durationMillis || _state.durationMillis || 0,
        });
      });
    } catch (e) {
      console.warn('[voice] play failed:', e);
      _resetState();
      return false;
    }
    })();

    _playPromise = run;
    try {
      return await run;
    } finally {
      if (_playPromise === run) _playPromise = null;
    }
  },

  async stop() {
    if (_webAudio) {
      _webAudio.pause();
      if (_webTick) { clearInterval(_webTick); _webTick = null; }
      _webAudio.src = '';
      try { _webAudio.load?.(); } catch {}
      _webAudio = null;
    }
    if (_sound) {
      await _sound.stopAsync().catch(() => {});
      await _sound.unloadAsync().catch(() => {});
      _sound = null;
    }
    _playingUri = null;
    _resetState();
  },

  // ─── Web fallback (MediaRecorder) ───
  _webRecorder: null,
  _webChunks: [],

  async _startWeb() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
      this._webRecorder = new MediaRecorder(stream, { mimeType });
      this._webChunks = [];
      this._webRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this._webChunks.push(e.data);
      };
      // start(400): чанки копятся каждые 400мс. Без timeslice iOS Safari на
      // короткой записи (1-2с) часто не успевает выдать данные к stop() —
      // блоб выходил пустым и юзер видел «Не удалось записать голосовое».
      this._webRecorder.start(400);
      this._startTime = Date.now();
      return true;
    } catch (e) {
      console.warn('[voice] web start failed:', e);
      return false;
    }
  },

  _stopWeb() {
    return new Promise((resolve) => {
      if (!this._webRecorder) { resolve({ uri: null, error: 'no_active_recording' }); return; }
      this._webRecorder.onstop = () => {
        const blob = new Blob(this._webChunks, { type: this._webRecorder.mimeType });
        const duration = Math.round((Date.now() - (this._startTime || Date.now())) / 1000);
        this._webRecorder.stream.getTracks().forEach(t => t.stop());
        this._webRecorder = null;
        this._webChunks = [];
        // Пустая запись (0 байт) → не создаём битый blob-URL. Так получатель
        // не получает «пустое» голосовое, а отправитель видит понятную ошибку.
        if (!blob || blob.size === 0) { resolve({ uri: null, error: 'empty_recording' }); return; }
        const uri = URL.createObjectURL(blob);
        resolve({ uri, duration, blob });
      };
      // requestData() форсит отдачу накопленных чанков ДО onstop — на part
      // мобильных браузеров (iOS Safari) без этого ondataavailable иногда
      // не срабатывает и blob выходит пустым.
      try { this._webRecorder.requestData(); } catch { /* не критично */ }
      this._webRecorder.stop();
    });
  },

  _playWeb(uri, rate = 1) {
    return new Promise((resolve) => {
      if (_webAudio && _playingUri === uri && !_webAudio.paused && !_webAudio.ended) {
        resolve(true);
        return;
      }
      if (_webAudio) {
        _webAudio.pause();
        if (_webTick) { clearInterval(_webTick); _webTick = null; }
        _webAudio.src = '';
        try { _webAudio.load?.(); } catch {}
        _webAudio = null;
      }
      const audio = new Audio(uri);
      audio.playbackRate = _state.rate || 1;
      _webAudio = audio;
      _playingUri = uri;
      _setState({ uri, isPlaying: true, positionMillis: 0, durationMillis: 0 });

      // Живой прогресс: timeupdate у HTMLAudioElement стреляет ~4 раза/сек —
      // для плавной полосы (как в WhatsApp) добавлен интервал 80мс.
      const tick = () => {
        if (_webAudio !== audio) return;
        _setState({
          positionMillis: Math.round((audio.currentTime || 0) * 1000),
          durationMillis: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : (_state.durationMillis || 0),
          isPlaying: !audio.paused && !audio.ended,
        });
      };
      if (_webTick) clearInterval(_webTick);
      _webTick = setInterval(tick, 80);

      audio.onloadedmetadata = tick;
      audio.ontimeupdate = tick;
      audio.onpause = () => { if (_webAudio === audio) _setState({ isPlaying: false }); };
      audio.onplay = () => { if (_webAudio === audio) _setState({ isPlaying: true }); };

      const cleanup = (ok) => {
        if (_webAudio === audio) {
          if (_webTick) { clearInterval(_webTick); _webTick = null; }
          _webAudio = null;
          _playingUri = null;
          _resetState();
        }
        resolve(ok);
      };
      // По окончании: сброс в начало + кнопка снова «play». Элемент НЕ
      // уничтожаем — повторный тап играет мгновенно, без пере-загрузки.
      audio.onended = () => {
        if (_webAudio === audio) {
          try { audio.currentTime = 0; } catch {}
          if (_webTick) { clearInterval(_webTick); _webTick = null; }
          _setState({ isPlaying: false, positionMillis: 0 });
        }
        resolve(true);
      };
      audio.onerror = (e) => { console.warn('[voice] web play error:', e); cleanup(false); };
      audio.play().catch(() => cleanup(false));
    });
  },
};
