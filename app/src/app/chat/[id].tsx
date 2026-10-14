import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AgreementBanner } from '@/components/AgreementBanner';
import { Icon } from '@/components/Icon';
import { Avatar, ErrorText, Header, IconButton, Screen } from '@/components/ui';
import { api, errorMessage, imageSource, type MatchDetail, type Message } from '@/lib/api';
import { pickPhotoBase64 } from '@/lib/photos';
import { colors, fonts } from '@/lib/theme';

const POLL_MS = 4000;

export default function Chat() {
  usePreventScreenCapture();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const lastId = useRef(0);

  const loadDetail = useCallback(async () => {
    try {
      setDetail(await api<MatchDetail>('GET', `/matches/${id}`));
    } catch (err) {
      Alert.alert('Chat není dostupný', errorMessage(err));
      router.back();
    }
  }, [id]);

  const poll = useCallback(async () => {
    const fresh = await api<Message[]>('GET', `/matches/${id}/messages?after=${lastId.current}`).catch(() => []);
    if (fresh.length) {
      lastId.current = fresh[fresh.length - 1].id;
      setMessages((m) => [...m, ...fresh]);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void loadDetail();
    }, [loadDetail]),
  );

  useEffect(() => {
    lastId.current = 0;
    setMessages([]);
    void poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  const send = async (body: { text?: string; jpegBase64?: string }) => {
    setSending(true);
    setError('');
    try {
      const msg = await api<Message>('POST', `/matches/${id}/messages`, body);
      lastId.current = Math.max(lastId.current, msg.id);
      setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
      if (body.text) setDraft('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const sendPhoto = async () => {
    const base64 = await pickPhotoBase64({ square: false }).catch(() => null);
    if (base64) await send({ jpegBase64: base64 });
  };

  const menu = () => {
    if (!detail) return;
    const { partner } = detail;
    Alert.alert(partner.name, undefined, [
      { text: 'Nahlásit', onPress: () => router.push(`/report/${partner.id}?name=${encodeURIComponent(partner.name)}`) },
      {
        text: 'Zablokovat',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Zablokovat ${partner.name}?`, 'Už se navzájem neuvidíte a chat zmizí.', [
            { text: 'Zrušit', style: 'cancel' },
            {
              text: 'Zablokovat',
              style: 'destructive',
              onPress: async () => {
                await api('POST', `/users/${partner.id}/block`).catch(() => {});
                router.replace('/matches');
              },
            },
          ]),
      },
      {
        text: 'Zrušit match',
        onPress: async () => {
          await api('DELETE', `/matches/${id}`).catch(() => {});
          router.replace('/matches');
        },
      },
      { text: 'Zpět', style: 'cancel' },
    ]);
  };

  const partner = detail?.partner;

  return (
    <Screen>
      <Header
        title={
          partner ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar name={partner.name} photo={partner.photos[0]} size={40} />
              <View>
                <Text style={s.headerName}>
                  {partner.name}, {partner.age}
                </Text>
                {partner.distanceKm != null ? <Text style={s.headerMeta}>{partner.distanceKm} km od tebe</Text> : null}
              </View>
            </View>
          ) : null
        }
        right={<IconButton name="flag" label="Nahlásit nebo zablokovat" onPress={menu} />}
      />
      <View style={{ paddingHorizontal: 14, paddingTop: 4 }}>{detail ? <AgreementBanner detail={detail} /> : null}</View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={8}>
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 14, gap: 8 }}
          renderItem={({ item }) => (
            <View style={{ gap: 6, alignItems: item.mine ? 'flex-end' : 'flex-start' }}>
              {item.warning ? (
                <View style={s.warning}>
                  <Icon name="shield" size={16} color={colors.warn} />
                  <Text style={s.warningText}>{item.warning}</Text>
                </View>
              ) : null}
              {item.imageUrl ? (
                <Pressable
                  accessibilityLabel={revealed.has(item.id) ? 'Fotka' : 'Rozmazaná fotka, klepni pro zobrazení'}
                  onPress={() => setRevealed((r) => new Set(r).add(item.id))}
                  style={s.photoWrap}
                >
                  {/* Fotky v chatu jsou rozmazané, dokud je příjemce sám neodkryje. */}
                  <Image source={imageSource(item.imageUrl)} style={s.photo} contentFit="cover" blurRadius={revealed.has(item.id) || item.mine ? 0 : 40} />
                  {!revealed.has(item.id) && !item.mine ? <Text style={s.photoHint}>Klepni pro zobrazení</Text> : null}
                </Pressable>
              ) : null}
              {item.text ? <Text style={[s.bubble, item.mine ? s.mine : s.theirs]}>{item.text}</Text> : null}
            </View>
          )}
        />
        <ErrorText>{error ? `  ${error}` : ''}</ErrorText>
        <View style={s.composer}>
          <Pressable accessibilityLabel="Poslat fotku" onPress={sendPhoto} style={s.attach}>
            <Icon name="image" color={colors.muted} />
          </Pressable>
          <TextInput
            accessibilityLabel="Zpráva"
            value={draft}
            onChangeText={setDraft}
            placeholder="Napiš zprávu…"
            placeholderTextColor={colors.faint}
            style={s.input}
            multiline
          />
          <Pressable
            accessibilityLabel="Odeslat"
            disabled={!draft.trim() || sending}
            onPress={() => send({ text: draft.trim() })}
            style={[s.send, !draft.trim() && { opacity: 0.4 }]}
          >
            <Icon name="send" size={20} color={colors.onAccent} strokeWidth={2.4} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  headerName: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  headerMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, borderRadius: 18, overflow: 'hidden' },
  mine: { backgroundColor: colors.accent, color: colors.onAccent, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.surface2, color: colors.text, borderBottomLeftRadius: 6 },
  warning: { maxWidth: '90%', flexDirection: 'row', gap: 8, padding: 10, borderRadius: 12, backgroundColor: colors.warnBg, borderWidth: 1, borderColor: colors.warnLine },
  warningText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
  photoWrap: { width: 220, height: 280, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  photo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  photoHint: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, backgroundColor: 'rgba(18,16,20,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  attach: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 18,
    paddingTop: 13,
    paddingBottom: 13,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
