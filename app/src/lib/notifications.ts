import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Upozornění',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Zaregistruje Expo push token u serveru. Bez EAS projectId (vývoj) tiše skončí. */
export async function registerPushToken() {
  try {
    if (!Device.isDevice || !(await setupNotifications())) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('PUT', '/auth/push-token', { pushToken: data });
  } catch {
    // push není kritický – bezpečnostní upozornění chodí důvěryhodné osobě přes SMS
  }
}

const reminderId = (sessionId: number) => `checkin-${sessionId}`;

/** Lokální připomínka check-inu – funguje i bez signálu. Text je neutrální (zamčená obrazovka). */
export async function scheduleCheckInReminder(sessionId: number, dueIso: string, discreet: boolean) {
  await cancelCheckInReminder(sessionId);
  const at = Date.parse(dueIso) - 60_000;
  if (at <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: reminderId(sessionId),
    content: {
      title: discreet ? 'Připomínka' : 'Čas na check-in',
      body: discreet ? '' : 'Potvrď PINem, že jsi v pořádku.',
      data: { type: 'safety', safetyId: sessionId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}

/** Falešný hovor, když je aplikace na pozadí – vypadá jako běžné upozornění na hovor. */
export async function scheduleFakeCallNotification(seconds: number, caller: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title: caller, body: 'Příchozí hovor', data: { type: 'fake-call' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: Date.now() + seconds * 1000 },
  });
}

export async function cancelCheckInReminder(sessionId: number) {
  await Notifications.cancelScheduledNotificationAsync(reminderId(sessionId)).catch(() => {});
}
