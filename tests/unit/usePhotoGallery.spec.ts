import { Camera } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { isPlatform } from '@ionic/vue';
import type * as IonicVue from '@ionic/vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

import type { UserPhoto } from '@/composables/usePhotoGallery';
import { usePhotoGallery } from '@/composables/usePhotoGallery';

vi.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: vi.fn() },
  CameraResultType: { Uri: 'uri' },
  CameraSource: { Camera: 'CAMERA' },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { readFile: vi.fn(), writeFile: vi.fn(), deleteFile: vi.fn() },
  Directory: { Data: 'DATA' },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: vi.fn(), set: vi.fn() },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { convertFileSrc: (uri: string) => `converted:${uri}` },
}));

vi.mock('@ionic/vue', async (importOriginal) => ({
  ...(await importOriginal<typeof IonicVue>()),
  isPlatform: vi.fn(),
}));

const NOW = 1700000000000;

const setHybrid = (hybrid: boolean): void => {
  vi.mocked(isPlatform).mockImplementation(
    ((platform: string) => platform === 'hybrid' && hybrid) as typeof isPlatform,
  );
};

// The composable uses onMounted and watch, so run it inside a component.
const mountGallery = async (saved: UserPhoto[] | null) => {
  vi.mocked(Preferences.get).mockResolvedValue({ value: saved ? JSON.stringify(saved) : null });
  let gallery!: ReturnType<typeof usePhotoGallery>;
  mount(
    defineComponent({
      setup() {
        gallery = usePhotoGallery();
        return () => null;
      },
    }),
  );
  await flushPromises();
  return gallery;
};

enableAutoUnmount(afterEach);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  setHybrid(false);
  vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: `file:///data/${NOW}.jpeg` });
  vi.mocked(Filesystem.readFile).mockImplementation(async ({ path }) => ({ data: `data-for-${path}` }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loading saved photos', () => {
  it('loads saved photos and reads each file as base64 on the web', async () => {
    const gallery = await mountGallery([{ filepath: 'a.jpeg' }, { filepath: 'b.jpeg' }]);

    expect(Preferences.get).toHaveBeenCalledWith({ key: 'photos' });
    expect(Filesystem.readFile).toHaveBeenCalledWith({ path: 'a.jpeg', directory: 'DATA' });
    expect(gallery.photos.value).toEqual([
      { filepath: 'a.jpeg', webviewPath: 'data:image/jpeg;base64,data-for-a.jpeg' },
      { filepath: 'b.jpeg', webviewPath: 'data:image/jpeg;base64,data-for-b.jpeg' },
    ]);
  });

  it('keeps the stored paths on native without reading the files', async () => {
    setHybrid(true);
    const saved = [{ filepath: 'file:///data/a.jpeg', webviewPath: 'converted:file:///data/a.jpeg' }];

    const gallery = await mountGallery(saved);

    expect(Filesystem.readFile).not.toHaveBeenCalled();
    expect(gallery.photos.value).toEqual(saved);
  });

  it('starts with an empty gallery when nothing is saved', async () => {
    const gallery = await mountGallery(null);

    expect(gallery.photos.value).toEqual([]);
    expect(Filesystem.readFile).not.toHaveBeenCalled();
  });
});

describe('takePhoto', () => {
  it('saves a web photo and adds it to the front of the gallery', async () => {
    const gallery = await mountGallery([{ filepath: 'older.jpeg' }]);
    vi.mocked(Camera.getPhoto).mockResolvedValue({ webPath: 'blob:new-photo', format: 'jpeg', saved: false });
    // Return the jsdom Blob directly: Node's Response would stringify it.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ blob: async () => new Blob(['image-bytes'], { type: 'image/jpeg' }) }),
    );

    await gallery.takePhoto();
    await flushPromises();

    expect(Camera.getPhoto).toHaveBeenCalledWith({ resultType: 'uri', source: 'CAMERA', quality: 100 });
    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: `${NOW}.jpeg`,
      data: `data:image/jpeg;base64,${btoa('image-bytes')}`,
      directory: 'DATA',
    });
    const expected = [
      { filepath: `${NOW}.jpeg`, webviewPath: 'blob:new-photo' },
      { filepath: 'older.jpeg', webviewPath: 'data:image/jpeg;base64,data-for-older.jpeg' },
    ];
    expect(gallery.photos.value).toEqual(expected);
    expect(Preferences.set).toHaveBeenLastCalledWith({ key: 'photos', value: JSON.stringify(expected) });
  });

  it.each([
    ['the photo cannot be read', 'error' as const],
    ['the photo is not read as a data URL', new ArrayBuffer(1)],
  ])('does not save a web photo when %s', async (_, outcome) => {
    const gallery = await mountGallery(null);
    // Loading the (empty) saved photos on mount already saved them once through the watcher.
    vi.mocked(Preferences.set).mockClear();
    vi.mocked(Camera.getPhoto).mockResolvedValue({ webPath: 'blob:new-photo', format: 'jpeg', saved: false });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => new Blob(['image-bytes']) }));
    vi.stubGlobal(
      'FileReader',
      class {
        result: unknown = null;
        onerror: ((error: unknown) => void) | null = null;
        onload: (() => void) | null = null;

        readAsDataURL(): void {
          if (outcome === 'error') {
            this.onerror?.(new Error('read failed'));
          } else {
            this.result = outcome;
            this.onload?.();
          }
        }
      },
    );

    await expect(gallery.takePhoto()).rejects.toBeDefined();
    await flushPromises();

    expect(Filesystem.writeFile).not.toHaveBeenCalled();
    expect(gallery.photos.value).toEqual([]);
    expect(Preferences.set).not.toHaveBeenCalled();
  });

  it('reads a native photo from its file path and converts the saved URI', async () => {
    setHybrid(true);
    const gallery = await mountGallery(null);
    vi.mocked(Camera.getPhoto).mockResolvedValue({
      path: 'file:///tmp/photo.jpeg',
      webPath: 'capacitor://localhost/_capacitor_file_/tmp/photo.jpeg',
      format: 'jpeg',
      saved: false,
    });
    vi.mocked(Filesystem.readFile).mockResolvedValue({ data: 'BASE64DATA' });

    await gallery.takePhoto();

    expect(Filesystem.readFile).toHaveBeenCalledWith({ path: 'file:///tmp/photo.jpeg' });
    expect(Filesystem.writeFile).toHaveBeenCalledWith({ path: `${NOW}.jpeg`, data: 'BASE64DATA', directory: 'DATA' });
    expect(gallery.photos.value).toEqual([
      { filepath: `file:///data/${NOW}.jpeg`, webviewPath: `converted:file:///data/${NOW}.jpeg` },
    ]);
  });

  it('converts native file data returned as a Blob to text', async () => {
    setHybrid(true);
    const gallery = await mountGallery(null);
    vi.mocked(Camera.getPhoto).mockResolvedValue({ path: 'file:///tmp/photo.jpeg', format: 'jpeg', saved: false });
    vi.mocked(Filesystem.readFile).mockResolvedValue({ data: new Blob(['BLOBDATA']) });

    await gallery.takePhoto();

    expect(Filesystem.writeFile).toHaveBeenCalledWith(expect.objectContaining({ data: 'BLOBDATA' }));
  });
});

describe('deletePhoto', () => {
  it('removes the photo from the gallery, storage, and filesystem', async () => {
    setHybrid(true);
    const saved = [
      { filepath: 'file:///data/a.jpeg' },
      { filepath: 'file:///data/b.jpeg' },
      { filepath: 'file:///data/c.jpeg' },
    ];
    const gallery = await mountGallery(saved);

    await gallery.deletePhoto(saved[1]);
    await flushPromises();

    expect(gallery.photos.value).toEqual([saved[0], saved[2]]);
    expect(Preferences.set).toHaveBeenLastCalledWith({ key: 'photos', value: JSON.stringify([saved[0], saved[2]]) });
    expect(Filesystem.deleteFile).toHaveBeenCalledWith({ path: 'b.jpeg', directory: 'DATA' });
  });
});
