// Demo: poloha se neptá (rám náhledu ji stejně zakazuje); demo účty mají polohu v Praze.
const denied = { granted: false, status: 'denied', canAskAgain: false };
module.exports = {
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  getForegroundPermissionsAsync: async () => denied,
  requestForegroundPermissionsAsync: async () => denied,
  getBackgroundPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
  requestBackgroundPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
  getCurrentPositionAsync: async () => {
    throw new Error('Poloha není v demu dostupná.');
  },
};
