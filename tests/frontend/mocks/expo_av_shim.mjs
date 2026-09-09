// P1-voice (2026-09-09).
//
// src/utils/voiceRecorder.js lazily does `require('expo-av')` INSIDE its
// play/recording methods (same deliberate pattern as push.js — see
// mocks/native_notifications_shim.mjs). loader.mjs's resolve-hook only
// intercepts ESM `import`, not CJS `require()`, and under Node's ESM module
// evaluation a bare `require` identifier isn't even defined (ReferenceError).
//
// So exercising the REAL playback lifecycle (play/pause/resume/switch/seek/
// rate/completion/error) needs a require() shim returning a fully scriptable
// fake expo-av Audio stack: Sound.createAsync returns an in-memory sound
// object whose status-update callback the test drives by hand (natural
// completion, progress ticks). No project source is modified; the shim is
// scoped to the test file that installs it.
export function installExpoAvRequireShim() {
  const state = {
    sounds: [],              // every sound created via Sound.createAsync, in order
    audioModeCalls: [],      // every setAudioModeAsync payload
    createAsyncThrows: null, // Error | null — force Sound.createAsync to reject
    playAsyncThrows: null,   // Error | null — force sound.playAsync() to reject
    nextDurationMillis: 5000,
  };

  function makeSound(uri, initialStatus) {
    const sound = {
      uri,
      loaded: true,
      playing: false,
      positionMillis: 0,
      durationMillis: initialStatus?.durationMillis || state.nextDurationMillis,
      rate: initialStatus?.rate ?? 1,
      progressUpdateIntervalMillis: initialStatus?.progressUpdateIntervalMillis,
      shouldCorrectPitch: initialStatus?.shouldCorrectPitch,
      onStatusUpdate: null,
      unloaded: false,
      unloadCalls: 0,
      _emit(patch) {
        try {
          this.onStatusUpdate?.({
            isLoaded: this.loaded,
            isPlaying: this.playing,
            positionMillis: this.positionMillis,
            durationMillis: this.durationMillis,
            ...patch,
          });
        } catch { /* тестовый подписчик не должен ломать эмиттер */ }
      },
      setOnPlaybackStatusUpdate(cb) { this.onStatusUpdate = cb; },
      async playAsync() {
        if (state.playAsyncThrows) throw state.playAsyncThrows;
        this.playing = true;
        this._emit();
        return {};
      },
      async pauseAsync() { this.playing = false; this._emit(); return {}; },
      async stopAsync() { this.playing = false; this.positionMillis = 0; this._emit(); return {}; },
      async unloadAsync() {
        this.unloadCalls += 1;
        this.loaded = false;
        this.playing = false;
        this.unloaded = true;
        return {};
      },
      async setPositionAsync(pos) { this.positionMillis = pos; this._emit(); return {}; },
      async setRateAsync(rate, shouldCorrectPitch) {
        this.rate = rate;
        this.shouldCorrectPitchArg = shouldCorrectPitch;
        return {};
      },
      async getStatusAsync() {
        return {
          isLoaded: this.loaded,
          isPlaying: this.playing,
          positionMillis: this.positionMillis,
          durationMillis: this.durationMillis,
        };
      },
    };
    return sound;
  }

  const Audio = {
    Sound: {
      async createAsync(source, initialStatus) {
        if (state.createAsyncThrows) throw state.createAsyncThrows;
        const sound = makeSound(source?.uri, initialStatus);
        state.sounds.push(sound);
        return { sound };
      },
    },
    async setAudioModeAsync(mode) { state.audioModeCalls.push(mode); },
    async requestPermissionsAsync() { return { granted: true, status: 'granted' }; },
    RecordingOptionsPresets: { HIGH_QUALITY: { extension: '.m4a' } },
    Recording: {
      async createAsync() { throw new Error('expo_av_shim: recording not supported in shim'); },
    },
  };

  const previous = globalThis.require;
  globalThis.require = (specifier) => {
    if (specifier === 'expo-av') return { Audio };
    if (typeof previous === 'function') return previous(specifier);
    throw new Error(`expo_av_shim: unmocked require('${specifier}')`);
  };

  return {
    state,
    Audio,
    uninstall() { globalThis.require = previous; },
  };
}
