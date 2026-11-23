import type { AudioSample, ConversionAudioOptions } from 'mediabunny'

/**
 * A 45 rpm record played at 33⅓ rpm runs at 33⅓ ÷ 45 of its speed, about 0.741. Tempo and pitch both drop:
 * about 26% slower and about 5.2 semitones lower, so a 120–128 BPM track lands at roughly 89–95 BPM.
 */
export const SPEED_45_AT_33 = 100 / 3 / 45

/** Sample rate of the slowed MP3. 44.1 kHz is one of the rates MP3 supports. */
export const SLOWED_OUTPUT_RATE = 44_100

/**
 * The audio is first resampled to this rate, then each block of samples is relabelled as SLOWED_OUTPUT_RATE.
 * Played back at the lower rate, the same samples last 1.35 times as long and sound lower, as on the turntable.
 * 44,100 × 45 ÷ 33⅓ = 59,535 Hz exactly.
 */
export const SLOWED_RESAMPLE_RATE = Math.round(SLOWED_OUTPUT_RATE / SPEED_45_AT_33)

type AudioSampleClass = typeof AudioSample

/** Conversion audio options that turn a normal conversion into a 45 → 33 one. */
export function slowedAudioOptions(AudioSampleCtor: AudioSampleClass): ConversionAudioOptions {
  return {
    // Fixed at stereo so Mediabunny never falls back to its default rate for an unusual channel layout,
    // which would change the speed.
    numberOfChannels: 2,
    sampleRate: SLOWED_RESAMPLE_RATE,
    processedNumberOfChannels: 2,
    processedSampleRate: SLOWED_OUTPUT_RATE,
    process: (sample) => relabelAsSlowed(sample, AudioSampleCtor),
  }
}

/** Copies one block of audio and relabels it at the output rate, stretching its timestamp to match. */
export function relabelAsSlowed(sample: AudioSample, AudioSampleCtor: AudioSampleClass): AudioSample {
  if (sample.sampleRate !== SLOWED_RESAMPLE_RATE) {
    throw new Error(
      `The 45 → 33 mode expected audio at ${SLOWED_RESAMPLE_RATE} Hz but received ${sample.sampleRate} Hz.`,
    )
  }
  const data = new Float32Array(sample.numberOfFrames * sample.numberOfChannels)
  sample.copyTo(data, { planeIndex: 0, format: 'f32' })
  return new AudioSampleCtor({
    data,
    format: 'f32',
    numberOfChannels: sample.numberOfChannels,
    sampleRate: SLOWED_OUTPUT_RATE,
    timestamp: sample.timestamp / SPEED_45_AT_33,
  })
}
