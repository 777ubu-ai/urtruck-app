// Запись и воспроизведение голосовых сообщений через expo-av
// Web: MediaRecorder API с audio/mp4 fallback
// Native: expo-av Audio.Recording

import { Platform } from 'react-native';

let _recording = null;
let _sound = null;
let _playResolve = null;
let _playToken = 0;
let _webAudio = null;

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
      const duration = Math.round((status.durationMillis || 0) / 1000);
      _recording = null;
      return { uri, duration };
    } catch (e) {
      console.warn('[voice] stop failed:', e);
      _recording = null;
      return null;
    }
  },

  // ─── Воспроизведение ───
  async play(uri, rate = 1) {
    const token = ++_playToken;
    try {
      if (_sound) {
        if (_playResolve) {
          try { _playResolve(false); } catch {}
          _playResolve = null;
        }
        await _sound.unloadAsync();
        _sound = null;
      }
      if (Platform.OS === 'web') {
      return this._playWeb(uri, rate);
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
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
      _sound = sound;
      return await new Promise(async (resolve) => {
        _playResolve = resolve;
        try { await sound.setRateAsync(rate, true); } catch {}
        sound.setOnPlaybackStatusUpdate((status) => {
          if (token !== _playToken) return;
          if (status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            if (_sound === sound) _sound = null;
            if (_playResolve === resolve) _playResolve = null;
            resolve(true);
          }
        });
        try {
          await sound.playAsync();
        } catch (error) {
          console.warn('[voice] native play start failed:', error);
          try { await sound.unloadAsync(); } catch {}
          if (_sound === sound) _sound = null;
          if (_playResolve === resolve) _playResolve = null;
          resolve(false);
        }
      });
    } catch (e) {
      console.warn('[voice] play failed:', e);
      return false;
    }
  },

  async stop() {
    if (_playResolve) {
      try { _playResolve(false); } catch {}
      _playResolve = null;
    }
    _playToken += 1;
    if (_sound) {
      await _sound.stopAsync().catch(() => {});
      await _sound.unloadAsync().catch(() => {});
      _sound = null;
    }
    if (_webAudio) {
      _webAudio.pause();
      _webAudio.currentTime = 0;
      _webAudio = null;
    }
  },

  async setRate(rate) {
    const safeRate = Math.max(0.5, Math.min(2, Number(rate) || 1));
    if (_sound) await _sound.setRateAsync(safeRate, true).catch(() => {});
    if (_webAudio) _webAudio.playbackRate = safeRate;
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
        const duration = Math.round((Date.now() - (this._startTime || Date.now())) / 1000);
        this._webRecorder.stream.getTracks().forEach(t => t.stop());
        this._webRecorder = null;
        this._webChunks = [];
        // Пустая запись (0 байт) → не создаём битый blob-URL. Так получатель
        // не получает «пустое» голосовое, а отправитель видит понятную ошибку.
        if (!blob || blob.size === 0) { resolve(null); return; }
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
      const audio = new Audio(uri);
      _webAudio = audio;
      audio.playbackRate = rate;
      audio.onended = () => { if (_webAudio === audio) _webAudio = null; resolve(true); };
      audio.onerror = (e) => { console.warn('[voice] web play error:', e); resolve(false); };
      audio.play().catch(() => { if (_webAudio === audio) _webAudio = null; resolve(false); });
    });
  },
};
