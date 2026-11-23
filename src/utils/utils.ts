import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from '../types/types'

export function isAcceptedFile(file: File): boolean {
    const name = file.name.toLowerCase()
    return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

export function isWithinSizeLimit(file: File, maxBytes: number = MAX_FILE_SIZE_BYTES): boolean {
    return file.size <= maxBytes
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    const units = ['KB', 'MB', 'GB']
    let value = bytes / 1024
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex += 1
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`
}

/** Suffix added to the file name of a 45 → 33 conversion. */
export const SLOWED_NAME_SUFFIX = ' (45 at 33)'

export function mpThreeNameFor(originalName: string, slowed = false): string {
    const dot = originalName.lastIndexOf('.')
    const base = dot >= 0 ? originalName.slice(0, dot) : originalName
    return `${base}${slowed ? SLOWED_NAME_SUFFIX : ''}.mp3`
}

export function makeId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
}