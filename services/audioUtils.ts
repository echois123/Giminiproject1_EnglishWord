// Utility to decode base64 string
export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Utility to decode audio data from raw PCM/Wait/MP3 bytes
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  // Gemini TTS returns raw PCM or similar depending on config, but standard fetch returns ArrayBuffer.
  // For Gemini 2.5 TTS preview, it typically returns linear16 PCM in the example, but we wrap it.
  // If we receive WAV/MP3 wrapped bytes, ctx.decodeAudioData works directly.
  // If raw PCM, we need manual decoding. 
  // Based on standard Google GenAI TTS examples, let's try standard decode first.
  
  try {
      // Clone data to avoid detaching if we need to fallback
      const bufferCopy = data.buffer.slice(0);
      return await ctx.decodeAudioData(bufferCopy);
  } catch (e) {
      // Fallback for raw PCM if standard decode fails (unlikely if we don't request raw PCM specifically without header)
      // Assuming 24kHz mono linear16 for raw PCM fallback
      const dataInt16 = new Int16Array(data.buffer);
      const frameCount = dataInt16.length / numChannels;
      const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

      for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
          channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
      }
      return buffer;
  }
}

export class AudioPlayer {
  private audioContext: AudioContext;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }

  async playBase64Audio(base64Data: string) {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    const bytes = decodeBase64(base64Data);
    const audioBuffer = await decodeAudioData(bytes, this.audioContext);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start(0);
  }
}

export const audioPlayer = new AudioPlayer();