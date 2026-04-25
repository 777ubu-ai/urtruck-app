// Запись и воспроизведение голосовых сообщений через expo-av
// Web: MediaRecorder API с audio/mp4 fallback
// Native: expo-av Audio.Recording

import { Platform } from 'react-native';

let _recording = null;
let _sound = null;

export const voice = {
  // ─── Запись ───
  async startRecording() {
    if (Platform.OS === 'web') {
      return this._startWeb();
    }
    try {
      const { Audio } = require('expo-av');
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
  async play(uri) {
    try {
      if (_sound) {
        await _sound.unloadAsync();
        _sound = null;
      }
      if (Platform.OS === 'web') {
        return this._playWeb(uri);
      }
      const { Audio } = require('expo-av');
      const { sound } = await Audio.Sound.createAsync({ uri });
      _sound = sound;
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
          _sound = null;
        }
      });
      return true;
    } catch (e) {
      console.warn('[voice] play failed:', e);
      return false;
    }
  },

  async stop() {
    if (_sound) {
      await _sound.stopAsync().catch(() => {});
      await _sound.unloadAsync().catch(() => {});
      _sound = null;
    }
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
      this._webRecorder.start();
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
        const uri = URL.createObjectURL(blob);
        const duration = Math.round((Date.now() - (this._startTime || Date.now())) / 1000);
        this._webRecorder.stream.getTracks().forEach(t => t.stop());
        this._webRecorder = null;
        this._webChunks = [];
        resolve({ uri, duration, blob });
      };
      this._webRecorder.stop();
    });
  },

  _playWeb(uri) {
    return new Promise((resolve) => {
      const audio = new Audio(uri);
      audio.onended = () => resolve(true);
      audio.onerror = (e) => { console.warn('[voice] web play error:', e); resolve(false); };
      audio.play().catch(() => resolve(false));
    });
  },
};
