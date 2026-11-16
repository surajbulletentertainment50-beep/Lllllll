export const requestPermissionsAsync = async () => ({
  granted: true,
  status: 'granted',
  canAskAgain: true,
});

export const saveToLibraryAsync = async (uri: string) => {
  try {
    const a = document.createElement('a');
    a.href = uri;
    a.download = `masti_video_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {}
  return true;
};

export default { requestPermissionsAsync, saveToLibraryAsync };
