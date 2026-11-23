import { describe, it, expect } from 'vitest'
import type { AudioSample, AudioSampleInit, AudioSampleCopyToOptions } from 'mediabunny'
import {
    SPEED_PRESETS,
    OUTPUT_RATE,
    resampleRateFor,
    relabelAtOutputRate,
    speedAudioOptions,
    parseCustomPercent,
    customSuffix,
    describeSpeed,
} from '../utils/speed'

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

const preset = (id: string) => SPEED_PRESETS.find((p) => p.id === id)!

describe('speed presets', () => {
    it('use the ratio of the two turntable speeds', () => {
        expect(preset('normal').factor).toBe(1)
        expect(preset('45-33').factor).toBeCloseTo(0.7407, 4)
        expect(preset('78-45').factor).toBeCloseTo(0.5769, 4)
        expect(preset('78-33').factor).toBeCloseTo(0.4274, 4)
        expect(preset('33-45').factor).toBeCloseTo(1.35, 12)
        // 45 → 33 takes a 120–128 BPM track to roughly 89–95 BPM, about 5.2 semitones lower.
        expect(120 * preset('45-33').factor).toBeCloseTo(88.9, 1)
        expect(128 * preset('45-33').factor).toBeCloseTo(94.8, 1)
        expect(12 * Math.log2(preset('45-33').factor)).toBeCloseTo(-5.2, 1)
    })

    it('name the file after the preset', () => {
        expect(SPEED_PRESETS.map((p) => p.suffix)).toEqual(['', ' (45 at 33)', ' (78 at 45)', ' (78 at 33)', ' (33 at 45)'])
    })

    it('resample to a whole-number rate within 0.002% of the exact speed', () => {
        expect(resampleRateFor(preset('45-33').factor)).toBe(59535)
        expect(resampleRateFor(preset('78-45').factor)).toBe(76440)
        expect(resampleRateFor(preset('78-33').factor)).toBe(103194)
        expect(resampleRateFor(preset('33-45').factor)).toBe(32667)
        for (const p of SPEED_PRESETS) {
            const actual = OUTPUT_RATE / resampleRateFor(p.factor)
            expect(Math.abs(actual / p.factor - 1)).toBeLessThan(0.00002)
        }
    })
})

describe('custom speed', () => {
    it('accepts 40 to 200 percent', () => {
        expect(parseCustomPercent('85')).toBe(0.85)
        expect(parseCustomPercent(' 40 ')).toBe(0.4)
        expect(parseCustomPercent('200')).toBe(2)
        expect(parseCustomPercent('92.5')).toBe(0.925)
    })

    it('refuses anything else', () => {
        for (const text of ['', '39.9', '200.1', '-50', 'abc', '85%', '1e2']) {
            expect(parseCustomPercent(text)).toBeNull()
        }
    })

    it('names the file after the percentage', () => {
        expect(customSuffix(0.85)).toBe(' (85% speed)')
        expect(customSuffix(0.925)).toBe(' (92.5% speed)')
        expect(customSuffix(1)).toBe('')
    })

    it('describes speed and pitch', () => {
        expect(describeSpeed(preset('45-33').factor)).toBe('74.1% speed · −5.2 semitones')
        expect(describeSpeed(1.35)).toBe('135% speed · +5.2 semitones')
        expect(describeSpeed(1)).toBe('100% speed · same pitch')
    })
})

describe('speed change', () => {
    it('relabels a slowed block at the output rate and stretches its timestamp', () => {
        const out = relabelAtOutputRate(block(59535, 2), 59535, Ctor) as unknown as FakeSample
        expect(out.sampleRate).toBe(44100)
        expect(out.numberOfChannels).toBe(2)
        expect(Array.from(out.data)).toEqual(Array.from(new Float32Array([0.1, -0.1, 0.2, -0.2])))
        expect(out.timestamp).toBeCloseTo(2.7, 12)
    })

    it('shrinks the timestamp of a sped-up block', () => {
        const out = relabelAtOutputRate(block(32667, 2.7), 32667, Ctor) as unknown as FakeSample
        expect(out.timestamp).toBeCloseTo(2.7 * 32667 / 44100, 12)
    })

    it('refuses audio at any other rate instead of producing the wrong speed', () => {
        expect(() => relabelAtOutputRate(block(48000, 0), 59535, Ctor)).toThrow(/expected audio at 59535 Hz but received 48000 Hz/)
    })

    it('asks Mediabunny for stereo at the resample rate and declares the output rate', () => {
        const options = speedAudioOptions(preset('78-33').factor, Ctor)
        expect(options).toMatchObject({
            numberOfChannels: 2,
            sampleRate: 103194,
            processedNumberOfChannels: 2,
            processedSampleRate: 44100,
        })
        const out = options.process!(block(103194, 1)) as unknown as FakeSample
        expect(out.sampleRate).toBe(44100)
        expect(out.timestamp).toBeCloseTo(103194 / 44100, 12)
    })
})
