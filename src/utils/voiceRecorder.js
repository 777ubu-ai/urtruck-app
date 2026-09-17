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

let _recording = null;
let _sound = null;
let _webAudio = null;
let _playingUri = null;
let _playPromise = null;
let _webTick = null;
let _nativePoll = null;
// Поколение активного play(): инкрементируется на каждый запуск play()/stop().
// run() сверяет свой номер после await createAsync — если за время создания
// звука юзер тапнул другой бабл (или stop), опоздавший звук выгружается и
// НЕ перетирает более новый _sound (иначе два трека играют одновременно).
let _playSeq = 0;

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

const _stopNativePoll = () => {
  if (_nativePoll) clearInterval(_nativePoll);
  _nativePoll = null;
};

const _applyNativePlaybackStatus = (sound, uri, status) => {
  if (!status?.isLoaded || _sound !== sound) return;
  const positionMillis = status.positionMillis || 0;
  const durationMillis = status.durationMillis || _state.durationMillis || 0;
  const stoppedAtEnd = !status.isPlaying
    && durationMillis > 0
    && positionMillis >= Math.max(0, durationMillis - Math.max(1500, durationMillis * 0.025));

  if (status.didJustFinish || stoppedAtEnd) {
    _stopNativePoll();
    sound.setPositionAsync(0).catch(() => {});
    sound.pauseAsync().catch(() => {});
    _setState({ isPlaying: false, positionMillis: 0, durationMillis });
    return;
  }

  _setState({
    uri,
    isPlaying: !!status.isPlaying,
    positionMillis,
    durationMillis,
  });
  if (!status.isPlaying) _stopNativePoll();
};

const _startNativePoll = (sound, uri) => {
  _stopNativePoll();
  let busy = false;
  _nativePoll = setInterval(async () => {
    if (busy) return;
    if (_sound !== sound) { _stopNativePoll(); return; }
    busy = true;
    try {
      const status = await sound.getStatusAsync();
      _applyNativePlaybackStatus(sound, uri, status);
    } catch {
      // Нативный callback остаётся основным источником прогресса; poll —
      // страховка Android, поэтому единичная ошибка чтения не ломает звук.
    } finally {
      busy = false;
    }
  }, 250);
};

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
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      _recording = recording;
      return true;
    } catch (e) {
      console.warn('[voice] start failed:', e);
      return false;
    }
  },

  async stopRecording() {
    if (Platform.OS === 'web') {
      return this._stopWeb();
    }
    if (!_recording) return null;
    try {
      await _recording.stopAndUnloadAsync();
      const uri = _recording.getURI();
      const status = await _recording.getStatusAsync();
      const durationMillis = Math.max(0, Math.round(status.durationMillis || 0));
      // A voice message is accepted only when its measured duration is within
      // the 60-second contract. `ceil` keeps 60.1s from being rounded down to
      // 60 and then silently accepted by the server.
      const duration = Math.ceil(durationMillis / 1000);
      _recording = null;
      return { uri, duration, durationMillis };
    } catch (e) {
      console.warn('[voice] stop failed:', e);
      _recording = null;
      return null;
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
      _stopNativePoll();
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
        _startNativePoll(_sound, _playingUri);
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

    const seq = ++_playSeq;
    const run = (async () => {
      if (Platform.OS === 'web') {
        return this._playWeb(uri);
      }

    let sound = null;
    try {
      if (_sound) {
        const prev = _sound;
        _stopNativePoll();
        // Ссылку обязаны скинуть ДО await: пока идёт unload, completion-
        // колбэк prev проверяет `_sound !== sound` и молчит корректно, а
        // error-путь catch ниже никогда не видит stale _sound.
        _sound = null;
        // unloadAsync может кинуть, если натив уже выгрузил звук — это НЕ
        // повод бросать весь play() (старое поведение ловило здесь
        // ReferenceError/stale _sound и уводило плеер в вечный fail).
        try { await prev.unloadAsync(); } catch { /* уже выгружен нативно */ }
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
      const { sound: created } = await Audio.Sound.createAsync(
        { uri },
        // progressUpdateIntervalMillis: полоса прогресса и таймер в бабле
        // должны идти плавно, как в WhatsApp; дефолт (500мс) даёт рывки.
        // Сначала создаём звук на паузе. На части Android/Expo AV устройств
        // callback, установленный уже ПОСЛЕ shouldPlay/playAsync, получает
        // только первый тик: звук идёт до конца, а UI навсегда остаётся на
        // 0:01. Поэтому listener обязан быть подключён до первого playAsync.
        { shouldPlay: false, progressUpdateIntervalMillis: 80, rate: _state.rate, shouldCorrectPitch: true },
      );
      sound = created;
      if (seq !== _playSeq) {
        // Пока создавался звук, стартовал более новый play()/stop() — этот
        // звук опоздал: выгружаем его и НЕ трогаем состояние нового трека.
        try { await sound.unloadAsync(); } catch { /* уже выгружен */ }
        return false;
      }
      _sound = sound;
      _playingUri = uri;
      _setState({ uri, isPlaying: true, positionMillis: 0, durationMillis: 0 });
      sound.setOnPlaybackStatusUpdate((status) => {
        _applyNativePlaybackStatus(sound, uri, status);
      });
      await sound.playAsync();
      // Некоторые Xiaomi/Expo AV не присылают вообще никакого финального
      // callback: живой прогресс идёт, затем UI остаётся на 0:59. Poll не
      // заменяет 80ms callback, а раз в 250ms страхует именно пропущенный
      // terminal status и гарантирует reset/replay после конца.
      _startNativePoll(sound, uri);
      return true;
    } catch (e) {
      console.warn('[voice] play failed:', e);
      // Error-путь обязан убирать следы: полуоткрытый звук (createAsync прошёл,
      // playAsync упал) выгружается, мёртвые ссылки чистятся — иначе следующий
      // play() спотыкается о stale _sound (вечный 'voice_play_fail').
      if (sound && _sound === sound) {
        _sound = null;
        try { await sound.unloadAsync(); } catch { /* уже выгружен нативно */ }
      }
      _playingUri = null;
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
    // Инвалидируем in-flight play(): его run() после createAsync увидит
    // устаревший номер поколения и выгрузит свой звук вместо восстановления.
    _playSeq += 1;
    _stopNativePoll();
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
      if (!this._webRecorder) { resolve(null); return; }
      this._webRecorder.onstop = () => {
        const blob = new Blob(this._webChunks, { type: this._webRecorder.mimeType });
        const durationMillis = Math.max(0, Date.now() - (this._startTime || Date.now()));
        const duration = Math.ceil(durationMillis / 1000);
        this._webRecorder.stream.getTracks().forEach(t => t.stop());
        this._webRecorder = null;
        this._webChunks = [];
        // Пустая запись (0 байт) → не создаём битый blob-URL. Так получатель
        // не получает «пустое» голосовое, а отправитель видит понятную ошибку.
        if (!blob || blob.size === 0) { resolve(null); return; }
        const uri = URL.createObjectURL(blob);
        resolve({ uri, duration, durationMillis, blob });
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
