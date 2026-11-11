import { voice } from './voiceRecorder';
import { createProtectedVoicePool } from './protectedVoicePool';

export const protectedVoicePool = createProtectedVoicePool(voice);
