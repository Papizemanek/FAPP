// Demo: prohlížeč v náhledu notifikace neumí.
const noop = async () => {};
module.exports = {
  setNotificationHandler() {},
  useLastNotificationResponse: () => null,
  setNotificationChannelAsync: noop,
  requestPermissionsAsync: async () => ({ status: 'denied' }),
  getExpoPushTokenAsync: async () => ({ data: '' }),
  scheduleNotificationAsync: noop,
  cancelScheduledNotificationAsync: noop,
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
};
