export const requestForegroundPermissionsAsync = async () => ({ status: 'granted', granted: true });
export const getCurrentPositionAsync = async () => ({
  coords: { latitude: 28.6139, longitude: 77.209 },
});

export default { requestForegroundPermissionsAsync, getCurrentPositionAsync };
