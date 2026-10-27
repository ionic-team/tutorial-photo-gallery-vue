import type { ActionSheetButton } from '@ionic/vue';
import type * as IonicVue from '@ionic/vue';
import { actionSheetController } from '@ionic/vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { close, trash } from 'ionicons/icons';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import type { UserPhoto } from '@/composables/usePhotoGallery';
import Tab2Page from '@/views/Tab2Page.vue';

const photos: UserPhoto[] = [
  { filepath: 'a.jpeg', webviewPath: 'data:image/jpeg;base64,AAA' },
  { filepath: 'b.jpeg', webviewPath: 'data:image/jpeg;base64,BBB' },
];

const gallery = vi.hoisted(() => ({
  addNewToGallery: vi.fn(),
  deletePhoto: vi.fn(),
}));

vi.mock('@/composables/usePhotoGallery', () => ({
  usePhotoGallery: () => ({ ...gallery, photos: ref(photos) }),
}));

vi.mock('@ionic/vue', async (importOriginal) => ({
  ...(await importOriginal<typeof IonicVue>()),
  actionSheetController: { create: vi.fn() },
}));

const present = vi.fn();

// Returns the buttons passed to the action sheet the page opened.
const actionSheetButtons = (): ActionSheetButton[] =>
  vi.mocked(actionSheetController.create).mock.calls[0][0]?.buttons as ActionSheetButton[];

const tapPhoto = async (wrapper: ReturnType<typeof mount>, index: number): Promise<void> => {
  await wrapper.findAll('ion-col button')[index].trigger('click');
  await flushPromises();
};

enableAutoUnmount(afterEach);

describe('Tab2Page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(actionSheetController.create).mockResolvedValue({ present } as unknown as HTMLIonActionSheetElement);
  });

  it('shows a thumbnail for each photo', () => {
    const wrapper = mount(Tab2Page);

    const images = wrapper.findAll('ion-col img');
    expect(images.map((img) => img.attributes('src'))).toEqual(photos.map((photo) => photo.webviewPath));
    expect(images.map((img) => img.attributes('alt'))).toEqual(['Photo 1', 'Photo 2']);
  });

  it('takes a photo when the camera button is tapped', async () => {
    const wrapper = mount(Tab2Page);

    await wrapper.find('ion-fab-button').trigger('click');

    expect(gallery.addNewToGallery).toHaveBeenCalledTimes(1);
  });

  it('opens the photo actions when a photo is tapped', async () => {
    const wrapper = mount(Tab2Page);

    await tapPhoto(wrapper, 1);

    expect(actionSheetController.create).toHaveBeenCalledWith(expect.objectContaining({ header: 'Photos' }));
    expect(actionSheetButtons()).toEqual([
      expect.objectContaining({ text: 'Delete', role: 'destructive', icon: trash }),
      expect.objectContaining({ text: 'Cancel', role: 'cancel', icon: close }),
    ]);
    expect(present).toHaveBeenCalled();
  });

  it('deletes the tapped photo when Delete is chosen', async () => {
    const wrapper = mount(Tab2Page);
    await tapPhoto(wrapper, 1);

    const deleteButton = actionSheetButtons().find((button) => button.text === 'Delete');
    expect(deleteButton?.handler).toBeTypeOf('function');
    deleteButton?.handler?.();

    expect(gallery.deletePhoto).toHaveBeenCalledWith(photos[1]);
  });

  it('keeps the photo when Cancel is chosen', async () => {
    const wrapper = mount(Tab2Page);
    await tapPhoto(wrapper, 0);

    const cancelButton = actionSheetButtons().find((button) => button.text === 'Cancel');
    expect(cancelButton?.handler).toBeTypeOf('function');
    cancelButton?.handler?.();

    expect(gallery.deletePhoto).not.toHaveBeenCalled();
  });
});
