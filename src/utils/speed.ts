import type { AudioSample, ConversionAudioOptions } from 'mediabunny'

/**
 * Turntable speed changes. Playing a record at the wrong speed changes tempo and pitch together by the
 * ratio of the two speeds, for example 33⅓ ÷ 45 ≈ 0.741 for a 45 played at 33⅓ (about 26% slower and
 * about 5.2 semitones lower, so 120–128 BPM lands at roughly 89–95 BPM).
 */
export type SpeedPresetId = 'normal' | '45-33' | '78-45' | '78-33' | '33-45' | 'custom'

export type SpeedPreset = {
  id: Exclude<SpeedPresetId, 'custom'>
  /** Button text. */
  label: string
  /** Playback speed as a fraction of the original: below 1 is slower and lower, above 1 faster and higher. */
  factor: number
  /** Added to the file name, before `.mp3`. Empty for normal speed. */
  suffix: string
}

const RPM_33 = 100 / 3

export const SPEED_PRESETS: readonly SpeedPreset[] = [
  { id: 'normal', label: 'Normal', factor: 1, suffix: '' },
  { id: '45-33', label: '45 → 33', factor: RPM_33 / 45, suffix: ' (45 at 33)' },
  { id: '78-45', label: '78 → 45', factor: 45 / 78, suffix: ' (78 at 45)' },
  { id: '78-33', label: '78 → 33', factor: RPM_33 / 78, suffix: ' (78 at 33)' },
  { id: '33-45', label: '33 → 45', factor: 45 / RPM_33, suffix: ' (33 at 45)' },
]

/** Limits for the Custom % field: from slower than 78 → 33 up to double speed. */
export const CUSTOM_PERCENT_MIN = 40
export const CUSTOM_PERCENT_MAX = 200

/** The custom speed as a factor, or `null` when the text is not a number from 40 to 200. */
export function parseCustomPercent(text: string): number | null {
  if (!/^\s*\d+(\.\d+)?\s*$/.test(text)) return null
  const percent = Number(text)
  if (percent < CUSTOM_PERCENT_MIN || percent > CUSTOM_PERCENT_MAX) return null
  return percent / 100
}

/** File-name suffix for a custom speed, e.g. ` (85% speed)`. Normal speed gets none. */
export function customSuffix(factor: number): string {
  return factor === 1 ? '' : ` (${Number((factor * 100).toFixed(1))}% speed)`
}

/** Sample rate of every speed-changed MP3. 44.1 kHz is one of the rates MP3 supports. */
export const OUTPUT_RATE = 44_100

/**
 * The audio is first resampled to this rate, then each block of samples is relabelled as OUTPUT_RATE.
 * Played back at the other rate, the same samples last 1 ÷ factor times as long and change pitch by the
 * same ratio, as on a turntable. Mediabunny needs a whole number, so the rate is rounded. Even at 200% speed (22,050 Hz) the
 * resulting speed is within 0.0023% of the one asked for.
 */
export function resampleRateFor(factor: number): number {
  return Math.round(OUTPUT_RATE / factor)
}

type AudioSampleClass = typeof AudioSample

/** Mediabunny conversion audio options that play the audio at `factor` times its speed. */
export function speedAudioOptions(factor: number, AudioSampleCtor: AudioSampleClass): ConversionAudioOptions {
  const resampleRate = resampleRateFor(factor)
  return {
    // Fixed at stereo so Mediabunny never falls back to its default rate for an unusual channel layout,
    // which would change the speed.
    numberOfChannels: 2,
    sampleRate: resampleRate,
    processedNumberOfChannels: 2,
    processedSampleRate: OUTPUT_RATE,
    process: (sample) => relabelAtOutputRate(sample, resampleRate, AudioSampleCtor),
  }
}

/** Copies one block of audio and relabels it at the output rate, scaling its timestamp to match. */
export function relabelAtOutputRate(
  sample: AudioSample,
  resampleRate: number,
  AudioSampleCtor: AudioSampleClass,
): AudioSample {
  if (sample.sampleRate !== resampleRate) {
    throw new Error(
      `The speed change expected audio at ${resampleRate} Hz but received ${sample.sampleRate} Hz.`,
    )
  }
  const data = new Float32Array(sample.numberOfFrames * sample.numberOfChannels)
  sample.copyTo(data, { planeIndex: 0, format: 'f32' })
  return new AudioSampleCtor({
    data,
    format: 'f32',
    numberOfChannels: sample.numberOfChannels,
    sampleRate: OUTPUT_RATE,
    // The exact factor after rounding the rate, so timestamps line up with the sample count.
    timestamp: (sample.timestamp * resampleRate) / OUTPUT_RATE,
  })
}

/** Short description of a speed, e.g. `74.1% speed · −5.2 semitones`. */
export function describeSpeed(factor: number): string {
  const percent = Number((factor * 100).toFixed(1))
  const semitones = 12 * Math.log2(factor)
  if (Math.abs(semitones) < 0.05) return `${percent}% speed · same pitch`
  const sign = semitones < 0 ? '−' : '+'
  return `${percent}% speed · ${sign}${Math.abs(semitones).toFixed(1)} semitones`
}
