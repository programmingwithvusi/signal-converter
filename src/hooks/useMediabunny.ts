import { useCallback, useRef, useState } from 'react'
import { speedAudioOptions } from '../utils/speed'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export type ConvertOptions = {
  /**
   * Playback speed as a fraction of the original, changing tempo and pitch together like a turntable:
   * 0.741 plays a 45 at 33⅓. Leave it out, or pass 1, for normal speed.
   */
  speed?: number
}

export function useMediabunny() {
  const readyRef = useRef(false)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (readyRef.current || loadState === 'loading') return
    setLoadState('loading')
    setLoadError(null)
    try {
      const { canEncodeAudio } = await import('mediabunny')
      if (!(await canEncodeAudio('mp3'))) {
        const { registerMp3Encoder } = await import('@mediabunny/mp3-encoder')
        registerMp3Encoder()
      }
      readyRef.current = true
      setLoadState('ready')
    } catch (err) {
      console.error(err)
      setLoadError(err instanceof Error ? err.message : 'Failed to prepare the converter engine.')
      setLoadState('error')
    }
  }, [loadState])

  const convert = useCallback(
    async (
      file: File,
      bitrate: string,
      onProgress: (ratio: number) => void,
      options: ConvertOptions = {},
    ): Promise<Blob> => {
      const { Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp3OutputFormat, AudioSample } = await import(
        'mediabunny'
      )

      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      const output = new Output({ format: new Mp3OutputFormat(), target: new BufferTarget() })

      const conversion = await Conversion.init({
        input,
        output,
        audio:
          options.speed !== undefined && options.speed !== 1
            ? { bitrate: bpsFromLabel(bitrate), ...speedAudioOptions(options.speed, AudioSample) }
            : { bitrate: bpsFromLabel(bitrate) },
      })

      if (!conversion.isValid) {
        throw new Error('No audio track could be extracted from this file.')
      }

      conversion.onProgress = onProgress
      await conversion.execute()

      const buffer = output.target.buffer
      if (!buffer) throw new Error('Conversion produced no output.')
      return new Blob([buffer], { type: 'audio/mpeg' })
    },
    []
  )

  return { load, convert, loadState, loadError }
}

// '192k' -> 192000 bits/sec
function bpsFromLabel(bitrate: string): number {
  return parseInt(bitrate, 10) * 1000
}

