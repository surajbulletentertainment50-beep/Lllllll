export const MediaTypeOptions = {
  All: 'All',
  Videos: 'Videos',
  Images: 'Images',
} as const;

export const VideoExportPreset = {
  HighestQuality: 0,
  MediumQuality: 1,
  LowQuality: 2,
  Passthrough: 3,
} as const;

export type ImagePickerAsset = any;

export const requestMediaLibraryPermissionsAsync = async () => ({
  granted: true,
  status: 'granted',
  canAskAgain: true,
});

export const launchImageLibraryAsync = async (options?: { mediaTypes?: string }) => {
  return new Promise<{ canceled: boolean; assets: any[] }>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.mediaTypes === MediaTypeOptions.Videos) input.accept = 'video/*';
    else if (options?.mediaTypes === MediaTypeOptions.Images) input.accept = 'image/*';
    else input.accept = 'image/*,video/*';

    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (file) {
        resolve({
          canceled: false,
          assets: [
            {
              uri: URL.createObjectURL(file),
              width: 720,
              height: 1280,
              type: file.type.startsWith('video') ? 'video' : 'image',
              fileName: file.name,
              fileSize: file.size,
              duration: 15,
            },
          ],
        });
      } else {
        resolve({ canceled: true, assets: [] });
      }
    };
    input.click();
  });
};

export default { MediaTypeOptions, requestMediaLibraryPermissionsAsync, launchImageLibraryAsync };
