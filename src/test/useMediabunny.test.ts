// useMediabunny.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMediabunny } from '../hooks/useMediabunny'

// Mock the dynamically-imported module itself. Vitest intercepts
// `await import('mediabunny')` the same way it intercepts a static
// import — vi.mock hoists and applies regardless of import style.
const mockExecute = vi.fn()
const mockInit = vi.fn()

vi.mock('mediabunny', () => ({
    Input: vi.fn(),
    // Called with `new` — Vitest 4 requires a constructable (non-arrow) implementation.
    Output: vi.fn().mockImplementation(function () {
        return { target: { buffer: new ArrayBuffer(8) } }
    }),
    Conversion: { init: (...args: unknown[]) => mockInit(...args) },
    ALL_FORMATS: {},
    BlobSource: vi.fn(),
    BufferTarget: vi.fn(),
    Mp3OutputFormat: vi.fn(),
    canEncodeAudio: vi.fn().mockResolvedValue(true),
}))

function makeFile(name = 'clip.mp4'): File {
    return new File(['x'], name, { type: 'video/mp4' })

}

beforeEach(() => {
    mockInit.mockReset()
    mockExecute.mockReset()
})

describe('useMediabunny', () => {
    it('reaches ready state on load()', async () => {
        const { result } = renderHook(() => useMediabunny())
        // console.log('Before loadState:', result.current.load())

        await act(() => result.current.load())

        await waitFor(() => expect(result.current.loadState).toBe('ready'))

    })
    it('converts bitrate label to bits per second correctly', async () => {
        mockInit.mockResolvedValue({
            isValid: true,
            execute: mockExecute,
            onProgress: undefined,
        })
        const { result } = renderHook(() => useMediabunny())
        await act(() => result.current.load())
        await result.current.convert(makeFile(), '256k', () => { })

        expect(mockInit).toHaveBeenCalledWith(
            expect.objectContaining({ audio: { bitrate: 256000 } })
        )
    })

    it('throws when the file has no convertible audio track', async () => {
        mockInit.mockResolvedValue({ isValid: false, execute: mockExecute })
        const { result } = renderHook(() => useMediabunny())
        await act(() => result.current.load())

        await expect(result.current.convert(makeFile(), '192k', () => { })).rejects.toThrow(
            /no audio track/i
        )
    })

    it('registers the MP3 encoder only when the browser cannot natively encode it', async () => {
        const mediabunny = await import('mediabunny')
        vi.mocked(mediabunny.canEncodeAudio).mockResolvedValueOnce(false)

        const registerMp3Encoder = vi.fn()
        vi.doMock('@mediabunny/mp3-encoder', () => ({ registerMp3Encoder }))

        const { result } = renderHook(() => useMediabunny())
        await act(() => result.current.load())

        expect(registerMp3Encoder).toHaveBeenCalledOnce()
    })

})