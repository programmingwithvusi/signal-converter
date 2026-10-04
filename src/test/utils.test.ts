// utils.test.ts
import { describe, it, expect } from 'vitest'
import { isAcceptedFile, isWithinSizeLimit, formatBytes, mpThreeNameFor, makeId } from '../utils/utils'
import { MAX_FILE_SIZE_BYTES } from '../types/types'

function makeFile(name: string, sizeBytes?: number): File {
    const file = new File(['x'], name)
    if (sizeBytes !== undefined) Object.defineProperty(file, 'size', { value: sizeBytes })
    return file
}

describe('isAcceptedFile', () => {
    it('accepts known video extensions, case-insensitively', () => {
        expect(isAcceptedFile(makeFile('clip.MP4'))).toBe(true)
        expect(isAcceptedFile(makeFile('clip.mkv'))).toBe(true)
    })

    it('rejects unsupported extensions', () => {
        expect(isAcceptedFile(makeFile('notes.txt'))).toBe(false)
        expect(isAcceptedFile(makeFile('image.png'))).toBe(false)
    })
})

describe('isWithinSizeLimit', () => {
    it('accepts files up to and including the default limit', () => {
        expect(isWithinSizeLimit(makeFile('clip.mp4', 1024))).toBe(true)
        expect(isWithinSizeLimit(makeFile('clip.mp4', MAX_FILE_SIZE_BYTES))).toBe(true)
    })

    it('rejects files over the default limit', () => {
        expect(isWithinSizeLimit(makeFile('clip.mp4', MAX_FILE_SIZE_BYTES + 1))).toBe(false)
    })

    it('honours a custom limit', () => {
        expect(isWithinSizeLimit(makeFile('clip.mp4', 100), 100)).toBe(true)
        expect(isWithinSizeLimit(makeFile('clip.mp4', 101), 100)).toBe(false)
    })
})

describe('formatBytes', () => {
    it('formats bytes under 1024 as B', () => {
        expect(formatBytes(512)).toBe('512 B')
    })

    it('formats KB and MB with one decimal', () => {
        expect(formatBytes(2048)).toBe('2.0 KB')
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    })
})

describe('mpThreeNameFor', () => {
    it('replaces the extension with .mp3', () => {
        expect(mpThreeNameFor('vacation.mp4')).toBe('vacation.mp3')
        expect(mpThreeNameFor('clip.final.mov')).toBe('clip.final.mp3')
    })

    it('handles filenames with no extension', () => {
        expect(mpThreeNameFor('novideo')).toBe('novideo.mp3')
    })
})

describe('makeId', () => {
    it('returns a non-empty string', () => {
        expect(makeId()).toMatch(/^[a-z0-9]+$/)
    })

    it('returns a different id on each call', () => {
        const ids = new Set(Array.from({ length: 200 }, makeId))
        expect(ids.size).toBe(200)
    })
})