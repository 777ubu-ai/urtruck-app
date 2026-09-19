// Compatibility layer for migrating the singleton voice service from
// deprecated expo-av to expo-audio. All API translation lives here.

const loadAudio = () => require('expo-audio');

const toLegacyStatus = (player, status = player.currentStatus || {}) => ({
  isLoaded: status.isLoaded ?? player.isLoaded ?? true,
  isPlaying: status.playing ?? player.playing ?? false,
  isBuffering: status.isBuffering ?? player.isBuffering ?? false,
  positionMillis: Math.max(0, Math.round((status.currentTime ?? player.currentTime ?? 0) * 1000)),
  durationMillis: Math.max(0, Math.round((status.duration ?? player.duration ?? 0) * 1000)),
  didJustFinish: !!status.didJustFinish,
});

class SoundCompat {
  constructor(player) {
    this.player = player;
    this.subscription = null;
  }

  setOnPlaybackStatusUpdate(listener) {
    this.subscription?.remove?.();
    this.subscription = listener
      ? this.player.addListener('playbackStatusUpdate', (status) => listener(toLegacyStatus(this.player, status)))
      : null;
  }

  async playAsync() {
    this.player.play();
    return this.getStatusAsync();
  }

  async pauseAsync() {
    this.player.pause();
    return this.getStatusAsync();
  }

  async stopAsync() {
    this.player.pause();
    await this.player.seekTo(0);
    return this.getStatusAsync();
  }

  async unloadAsync() {
    this.subscription?.remove?.();
    this.subscription = null;
    this.player.remove();
    return {};
  }

  async setPositionAsync(positionMillis) {
    await this.player.seekTo(Math.max(0, positionMillis || 0) / 1000);
    return this.getStatusAsync();
  }

  async setRateAsync(rate, shouldCorrectPitch = true) {
    this.player.shouldCorrectPitch = shouldCorrectPitch;
    this.player.setPlaybackRate(rate, shouldCorrectPitch ? 'high' : undefined);
    return this.getStatusAsync();
  }

  async getStatusAsync() {
    return toLegacyStatus(this.player);
  }

  static async createAsync(source, initialStatus = {}) {
    const { createAudioPlayer } = loadAudio();
    const player = createAudioPlayer(source, {
      updateInterval: initialStatus.progressUpdateIntervalMillis || 500,
    });
    const sound = new SoundCompat(player);
    if (initialStatus.rate) {
      await sound.setRateAsync(initialStatus.rate, initialStatus.shouldCorrectPitch !== false);
    }
    if (initialStatus.positionMillis) {
      await sound.setPositionAsync(initialStatus.positionMillis);
    }
    if (initialStatus.shouldPlay) {
      await sound.playAsync();
    }
    return { sound, status: await sound.getStatusAsync() };
  }
}

class RecordingCompat {
  constructor(recorder) {
    this.recorder = recorder;
  }

  async stopAndUnloadAsync() {
    await this.recorder.stop();
  }

  getURI() {
    return this.recorder.uri || this.recorder.getStatus()?.url || null;
  }

  async getStatusAsync() {
    const status = this.recorder.getStatus();
    return {
      isRecording: !!status?.isRecording,
      durationMillis: Math.max(0, Math.round(status?.durationMillis || 0)),
    };
  }
}

const setAudioModeAsync = async (legacyMode = {}) => {
  const { setAudioModeAsync: setMode } = loadAudio();
  return setMode({
    allowsRecording: !!legacyMode.allowsRecordingIOS,
    playsInSilentMode: legacyMode.playsInSilentModeIOS !== false,
    shouldPlayInBackground: !!legacyMode.staysActiveInBackground,
    shouldRouteThroughEarpiece: !!legacyMode.playThroughEarpieceAndroid,
  });
};

export const Audio = {
  requestPermissionsAsync: async () => {
    const { requestRecordingPermissionsAsync } = loadAudio();
    return requestRecordingPermissionsAsync();
  },
  setAudioModeAsync,
  RecordingOptionsPresets: {
    get HIGH_QUALITY() {
      return loadAudio().RecordingPresets.HIGH_QUALITY;
    },
  },
  Recording: {
    async createAsync(options) {
      const { AudioModule } = loadAudio();
      const recorder = new AudioModule.AudioRecorder({});
      await recorder.prepareToRecordAsync(options);
      recorder.record();
      return { recording: new RecordingCompat(recorder) };
    },
  },
  Sound: {
    createAsync: (...args) => SoundCompat.createAsync(...args),
  },
};
