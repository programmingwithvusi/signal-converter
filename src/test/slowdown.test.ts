import { describe, it, expect } from 'vitest'
import type { AudioSample, AudioSampleInit, AudioSampleCopyToOptions } from 'mediabunny'
import {
    SPEED_45_AT_33,
    SLOWED_OUTPUT_RATE,
    SLOWED_RESAMPLE_RATE,
    relabelAsSlowed,
    slowedAudioOptions,
} from '../utils/slowdown'

// Minimal stand-in for Mediabunny's AudioSample: interleaved f32 only.
class FakeSample {
    readonly format = 'f32' as const
    readonly data: Float32Array
    readonly numberOfChannels: number
    readonly sampleRate: number
    readonly timestamp: number
    constructor(init: AudioSampleInit) {
        this.data = new Float32Array(init.data as ArrayBuffer | Float32Array)
        this.numberOfChannels = init.numberOfChannels
        this.sampleRate = init.sampleRate
        this.timestamp = init.timestamp
    }
    get numberOfFrames() {
        return this.data.length / this.numberOfChannels
    }
    copyTo(destination: Float32Array, options: AudioSampleCopyToOptions) {
        expect(options).toEqual({ planeIndex: 0, format: 'f32' })
        destination.set(this.data)
    }
}
const Ctor = FakeSample as unknown as typeof AudioSample

function block(rate: number, timestamp: number) {
    // Two stereo frames: L1 R1 L2 R2.
    return new Ctor({ data: new Float32Array([0.1, -0.1, 0.2, -0.2]), format: 'f32', numberOfChannels: 2, sampleRate: rate, timestamp })
}

describe('45 → 33 slowdown', () => {
    it('runs at 33⅓ ÷ 45 of the original speed', () => {
        expect(SPEED_45_AT_33).toBeCloseTo(0.7407, 4)
        // About 5.2 semitones lower.
        expect(12 * Math.log2(SPEED_45_AT_33)).toBeCloseTo(-5.2, 1)
        // A 120–128 BPM house track lands at roughly 89–95 BPM.
        expect(120 * SPEED_45_AT_33).toBeCloseTo(88.9, 1)
        expect(128 * SPEED_45_AT_33).toBeCloseTo(94.8, 1)
    })

    it('resamples to exactly 1.35 times the MP3 rate', () => {
        expect(SLOWED_OUTPUT_RATE).toBe(44100)
        expect(SLOWED_RESAMPLE_RATE).toBe(59535)
        expect(SLOWED_OUTPUT_RATE / SLOWED_RESAMPLE_RATE).toBeCloseTo(SPEED_45_AT_33, 12)
    })

    it('relabels a block at the output rate and stretches its timestamp', () => {
        const out = relabelAsSlowed(block(SLOWED_RESAMPLE_RATE, 2), Ctor) as unknown as FakeSample
        expect(out.sampleRate).toBe(44100)
        expect(out.numberOfChannels).toBe(2)
        expect(Array.from(out.data)).toEqual(Array.from(new Float32Array([0.1, -0.1, 0.2, -0.2])))
        expect(out.timestamp).toBeCloseTo(2.7, 12)
    })

    it('refuses audio at any other rate instead of producing the wrong speed', () => {
        expect(() => relabelAsSlowed(block(48000, 0), Ctor)).toThrow(/expected audio at 59535 Hz but received 48000 Hz/)
    })

    it('asks Mediabunny for stereo at the resample rate and declares the output rate', () => {
        const options = slowedAudioOptions(Ctor)
        expect(options).toMatchObject({
            numberOfChannels: 2,
            sampleRate: 59535,
            processedNumberOfChannels: 2,
            processedSampleRate: 44100,
        })
        const out = options.process!(block(SLOWED_RESAMPLE_RATE, 1)) as unknown as FakeSample
        expect(out.sampleRate).toBe(44100)
        expect(out.timestamp).toBeCloseTo(1.35, 12)
    })
})
