// App.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react';

import App from '../App';

const mockConvert = vi.fn();
const mockReadQuota = vi.fn();
const mockRecordConversion = vi.fn();
// Stands in for the account's count in Firestore.
let serverCount = 0;

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' }, loading: false }),
}));
vi.mock('../utils/quota', () => ({
  readQuotaCount: (...args: unknown[]) => mockReadQuota(...args),
  recordConversion: (...args: unknown[]) => mockRecordConversion(...args),
}));

// Mutable so a test can put the engine in its loading or failed state.
const engine = vi.hoisted(() => ({
  loadState: 'ready' as 'idle' | 'loading' | 'ready' | 'error',
  loadError: null as string | null,
}));

vi.mock('../hooks/useMediabunny', () => ({
  useMediabunny: () => ({
    load: vi.fn(),
    convert: mockConvert,
    loadState: engine.loadState,
    loadError: engine.loadError,
  }),
}));

const mockZipFile = vi.fn();
const mockZipGenerate = vi.fn();

vi.mock('jszip', () => ({
  default: class {
    file = mockZipFile;
    generateAsync = mockZipGenerate;
  },
}));

function makeFile(name: string, sizeBytes = 1024): File {
  const file = new File(['x'], name, { type: 'video/mp4' });
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true });
  return file;
}

async function dropFiles(...names: string[]) {
  const dropzone = screen
    .getByText(/drag video files here/i)
    .closest('section')!;
  await act(async () => {
    fireEvent.drop(dropzone, {
      dataTransfer: { files: names.map((name) => makeFile(name)) },
    });
  });
}

async function convertQueued() {
  const button = await screen.findByRole('button', { name: /convert to mp3/i });
  // Disabled until the account's quota has loaded.
  await waitFor(() => expect(button).toBeEnabled());
  await act(async () => {
    fireEvent.click(button);
  });
}

// Records the `download` filename of every anchor the app clicks to save a file.
function captureDownloads(): string[] {
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return names;
}

beforeEach(() => {
  mockZipFile.mockReset();
  mockZipGenerate.mockReset();
  mockZipGenerate.mockResolvedValue(new Blob(['zip']));
  // jsdom has no object-URL support.
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  vi.stubEnv('VITE_DAILY_LIMIT', '5');
  engine.loadState = 'ready';
  engine.loadError = null;
  serverCount = 0;
  mockReadQuota.mockReset();
  mockReadQuota.mockImplementation(async () => serverCount);
  mockRecordConversion.mockReset();
  mockRecordConversion.mockImplementation(async () => ++serverCount);
  mockConvert.mockReset();
  mockConvert.mockResolvedValue(new Blob(['fake mp3'], { type: 'audio/mpeg' }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('App', () => {
  it('adds a dropped file to the queue', async () => {
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeFile('clip.mp4')] },
    });
    expect(await screen.findByText('clip.mp4')).toBeInTheDocument();
  });

  it('rejects a file over the size limit with an inline error', async () => {
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;
    const hugeFile = makeFile('huge.mp4', 600 * 1024 * 1024); // over your 500MB cap
    fireEvent.drop(dropzone, { dataTransfer: { files: [hugeFile] } });
    expect(await screen.findByText(/exceeds.*size limit/i)).toBeInTheDocument();
  });

  it('converts a queued file and shows it as done', async () => {
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeFile('clip.mp4')] },
    });

    await convertQueued();

    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(1));

    expect(await screen.findByText(/1\/5 today/i)).toBeInTheDocument();
  });

  it('blocks conversion once the daily quota is exhausted', async () => {
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;
    // Queue 6 files, one over the limit of 5
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`clip${i}.mp4`));

    await act(async () => {
      fireEvent.drop(dropzone, { dataTransfer: { files } });
    });
    await convertQueued();

    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(5));

    expect(await screen.findByText(/5\/5 today/i)).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /daily limit reached/i }),
    ).toBeDisabled();
    // The sixth file is left unconverted with the limit error on its row.
    expect(
      await screen.findByText(/daily limit reached \(5\/day\)/i),
    ).toBeInTheDocument();
    expect(mockConvert).toHaveBeenCalledTimes(5);
  });

  it('starts from the count already used on the account', async () => {
    serverCount = 4;
    render(<App />);
    expect(await screen.findByText(/4\/5 today/i)).toBeInTheDocument();
    await dropFiles('a.mp4', 'b.mp4');
    await convertQueued();

    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/5\/5 today/i)).toBeInTheDocument();
    expect(mockRecordConversion).toHaveBeenCalledWith('user-1');
  });

  it('does not allow converting while the quota is loading', async () => {
    mockReadQuota.mockReturnValue(new Promise(() => {}));
    render(<App />);
    await dropFiles('clip.mp4');
    expect(screen.getByText(/checking quota/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /convert to mp3/i })).toBeDisabled();
  });

  it('does not allow converting when the quota cannot be read', async () => {
    mockReadQuota.mockRejectedValue(new Error('offline'));
    render(<App />);
    await dropFiles('clip.mp4');
    expect(await screen.findByText(/quota unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /convert to mp3/i })).toBeDisabled();
    expect(mockConvert).not.toHaveBeenCalled();
  });

  it('retries only failed, non-invalid jobs', async () => {
    mockConvert
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(new Blob(['x']));
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeFile('clip.mp4')] },
    });
    await convertQueued();
    await act(() => screen.findByText(/boom/i));
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /retry failed/i }),
      );
    });
    await convertQueued();
    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(2));
  });

  it('adds files chosen with the Browse Files picker, ignoring unsupported ones', async () => {
    const { container } = render(<App />);
    const picker = container.querySelector('input[type="file"]')!;
    await act(async () => {
      fireEvent.change(picker, {
        target: { files: [makeFile('picked.mp4'), makeFile('notes.txt')] },
      });
    });
    expect(screen.getByText('picked.mp4')).toBeInTheDocument();
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
    expect(screen.getByText('Queue (1)')).toBeInTheDocument();
  });

  it('converts at 192k unless another bitrate is selected', async () => {
    render(<App />);
    await dropFiles('first.mp4');
    await convertQueued();
    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(1));
    expect(mockConvert.mock.calls[0][1]).toBe('192k');

    fireEvent.click(screen.getByRole('button', { name: '320k' }));
    await dropFiles('second.mp4');
    await convertQueued();
    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(2));
    expect(mockConvert.mock.calls[1][1]).toBe('320k');
  });

  it('reports a failed engine and does not allow converting', async () => {
    engine.loadState = 'error';
    engine.loadError = 'WebCodecs unavailable';
    render(<App />);
    await dropFiles('clip.mp4');
    expect(screen.getByText('ENGINE ERROR')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Engine failed — WebCodecs unavailable',
    );
    await screen.findByText(/0\/5 today/i);
    expect(screen.getByRole('button', { name: /convert to mp3/i })).toBeDisabled();
  });

  it('does not allow converting while the engine is loading', async () => {
    engine.loadState = 'loading';
    render(<App />);
    await dropFiles('clip.mp4');
    expect(screen.getByText('LOADING ENGINE')).toBeInTheDocument();
    await screen.findByText(/0\/5 today/i);
    expect(screen.getByRole('button', { name: /convert to mp3/i })).toBeDisabled();
  });

  it('removes a single job from the queue', async () => {
    render(<App />);
    await dropFiles('keep.mp4', 'drop.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Remove drop.mp4' }));
    expect(screen.queryByText('drop.mp4')).not.toBeInTheDocument();
    expect(screen.getByText('keep.mp4')).toBeInTheDocument();
    expect(screen.getByText('Queue (1)')).toBeInTheDocument();
  });

  it('clears the whole queue', async () => {
    render(<App />);
    await dropFiles('a.mp4', 'b.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('a.mp4')).not.toBeInTheDocument();
    expect(screen.queryByText('b.mp4')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Queue/)).not.toBeInTheDocument();
  });

  it('clears completed jobs and keeps the rest', async () => {
    render(<App />);
    await dropFiles('done.mp4');
    await convertQueued();
    await screen.findByRole('button', { name: 'Save' });
    await dropFiles('waiting.mp4');

    fireEvent.click(screen.getByRole('button', { name: /clear completed/i }));
    expect(screen.queryByText('done.mp4')).not.toBeInTheDocument();
    expect(screen.getByText('waiting.mp4')).toBeInTheDocument();
  });

  it('saves a converted file under its .mp3 name', async () => {
    const downloads = captureDownloads();
    render(<App />);
    await dropFiles('holiday.mp4');
    await convertQueued();

    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(downloads).toEqual(['holiday.mp3']);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('downloads only the converted files as one zip', async () => {
    mockConvert
      .mockResolvedValueOnce(new Blob(['a']))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(new Blob(['c']));
    const downloads = captureDownloads();
    render(<App />);
    await dropFiles('a.mp4', 'bad.mp4', 'c.mov');
    await convertQueued();
    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(3));

    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /download all/i }),
      );
    });
    await waitFor(() => expect(downloads).toEqual(['converted-audio.zip']));
    expect(mockZipFile.mock.calls.map(([name]) => name)).toEqual([
      'a.mp3',
      'c.mp3',
    ]);
    expect(mockZipGenerate).toHaveBeenCalledWith({ type: 'blob' });
  });

  it('renders progress bars with correct ARIA attributes', async () => {
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeFile('clip.mp4')] },
    });

    const progressbar = await screen.findByRole('progressbar', {
      name: /clip\.mp4 conversion progress/i,
    });
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });
});
