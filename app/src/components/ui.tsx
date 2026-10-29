import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { imageSource } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { avatarTones, colors, fonts } from '@/lib/theme';
import { Icon, type IconName } from './Icon';

export function Screen({ children, edges = ['top', 'bottom'], style }: { children?: ReactNode; edges?: Edge[]; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <Text style={{ fontFamily: fonts.display, fontSize: size, color: colors.text, letterSpacing: -size / 50, writingDirection: 'ltr' }}>
      YesYes<Text style={{ color: colors.accent }}>*</Text>
    </Text>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, muted && { color: colors.muted }, style]}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Header({ title, right, onBack }: { title?: ReactNode; right?: ReactNode; onBack?: () => void }) {
  const t = useT();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        style={styles.iconButton}
      >
        <Icon name="back" />
      </Pressable>
      <View style={{ flex: 1 }}>{typeof title === 'string' ? <Text style={styles.headerTitle}>{title}</Text> : title}</View>
      {right}
    </View>
  );
}

export function IconButton({ name, label, onPress, color }: { name: IconName; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconButton}>
      <Icon name={name} color={color ?? colors.muted} />
    </Pressable>
  );
}

type ButtonVariant = 'accent' | 'safe' | 'ghost' | 'danger' | 'sos';

export function Button({
  label,
  onPress,
  onLongPress,
  variant = 'accent',
  disabled,
  loading,
  style,
  height = 56,
}: {
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  height?: number;
}) {
  const v = buttonVariants[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      disabled={inactive}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={700}
      style={({ pressed }) => [
        styles.button,
        { height, backgroundColor: v.bg, borderColor: v.border, borderWidth: v.border ? 1.5 : 0 },
        disabled && { backgroundColor: colors.lineSoft, borderColor: colors.lineSoft },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: disabled ? colors.faint : v.fg }, variant === 'sos' && styles.sosText]}>{label}</Text>
      )}
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  accent: { bg: colors.accent, fg: colors.onAccent },
  safe: { bg: colors.safe, fg: colors.onAccent },
  ghost: { bg: 'transparent', fg: colors.text, border: colors.lineStrong },
  danger: { bg: 'transparent', fg: colors.alarm, border: colors.lineStrong },
  sos: { bg: colors.sos, fg: '#FFFFFF' },
};

export function Chip({ label, selected, onPress, tone = 'accent' }: { label: string; selected: boolean; onPress: () => void; tone?: 'accent' | 'safe' }) {
  const on = tone === 'safe' ? { border: colors.safe, bg: colors.safeBg } : { border: colors.accent, bg: colors.accentBg };
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected ? { borderColor: on.border, backgroundColor: on.bg, borderWidth: 1.5 } : null]}
    >
      <Text style={[styles.chipText, selected && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.faint}
        style={[styles.input, props.multiline && { height: undefined, minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Jednorázový kód (z e-mailu nebo autentizační aplikace). allowRecovery = i záložní kód „xxxxx-xxxxx“. */
export function CodeField({ label, value, onChangeText, allowRecovery = false }: { label: string; value: string; onChangeText: (v: string) => void; allowRecovery?: boolean }) {
  return (
    <Field
      label={label}
      value={value}
      onChangeText={(v) => onChangeText(allowRecovery ? v.replace(/[^0-9a-zA-Z-]/g, '').slice(0, 11) : v.replace(/\D/g, '').slice(0, 6))}
      keyboardType={allowRecovery ? 'default' : 'number-pad'}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      style={[styles.input, { fontFamily: fonts.bold, fontSize: 22, letterSpacing: allowRecovery ? 2 : 8, textAlign: 'center' }]}
    />
  );
}

export function Checkbox({ checked, onToggle, children, tone = 'safe' }: { checked: boolean; onToggle: () => void; children: ReactNode; tone?: 'safe' | 'accent' }) {
  const color = tone === 'safe' ? colors.safe : colors.accent;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={[styles.checkRow, { borderColor: checked ? color : colors.line }]}
    >
      <View style={[styles.checkBox, checked && { backgroundColor: color, borderColor: color }]}>
        {checked ? <Icon name="check" size={16} color={colors.onAccent} strokeWidth={3} /> : null}
      </View>
      <Text style={styles.checkText}>{children}</Text>
    </Pressable>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={[styles.switchTrack, value && { backgroundColor: colors.safe }]}>
        <View style={[styles.switchThumb, value && { transform: [{ translateX: 20 }] }]} />
      </View>
    </Pressable>
  );
}

export type BannerTone = 'safe' | 'warn' | 'alarm' | 'neutral';
const bannerTones: Record<BannerTone, { fg: string; bg: string; line: string }> = {
  safe: { fg: colors.safe, bg: colors.safeBg, line: colors.safeLine },
  warn: { fg: colors.warn, bg: colors.warnBg, line: colors.warnLine },
  alarm: { fg: colors.alarm, bg: colors.alarmBg, line: colors.alarmLine },
  neutral: { fg: colors.text, bg: colors.surface, line: colors.lineSoft },
};

export function Banner({
  tone = 'neutral',
  icon = 'shield',
  title,
  subtitle,
  action,
  onPress,
}: {
  tone?: BannerTone;
  icon?: IconName;
  title: string;
  subtitle?: string;
  action?: string;
  onPress?: () => void;
}) {
  const t = bannerTones[tone];
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[styles.banner, { backgroundColor: t.bg, borderColor: t.line }]}
    >
      <Icon name={icon} color={t.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.bannerTitle, tone !== 'neutral' && { color: tone === 'safe' ? colors.text : t.fg }]}>{title}</Text>
        {subtitle ? <Text style={styles.hint}>{subtitle}</Text> : null}
      </View>
      {action ? (
        <View style={[styles.bannerAction, { backgroundColor: tone === 'neutral' ? colors.accent : t.fg }]}>
          <Text style={styles.bannerActionText}>{action}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Avatar({ name, photo, size = 40, index = 0 }: { name: string; photo?: string | null; size?: number; index?: number }) {
  const source = imageSource(photo);
  if (source) return <Image source={source} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarTones[index % avatarTones.length] }]}>
      <Text style={{ fontFamily: fonts.display, color: colors.text, fontSize: size * 0.42 }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = '',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  const t = useT();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  // Číslo jde rovnou napsat; podržené tlačítko přičítá čím dál rychleji.
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const latest = useRef(value);
  latest.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const hold = (dir: 1 | -1) => {
    let delay = 400;
    const tick = () => {
      const next = clamp(latest.current + dir * step);
      if (next === latest.current) return stop();
      latest.current = next;
      onChange(next);
      delay = Math.max(50, delay * 0.75);
      timer.current = setTimeout(tick, delay);
    };
    tick();
  };
  const commit = () => {
    const n = parseInt(text.replace(/\D/g, ''), 10);
    const v = Number.isFinite(n) ? clamp(n) : value;
    setText(String(v));
    if (v !== value) onChange(v);
  };
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { flex: 1 }]}>{label}</Text>
      <Pressable accessibilityLabel={t('ui.stepperDecrease', { label })} onPressIn={() => hold(-1)} onPressOut={stop} style={styles.stepBtn}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <View style={{ width: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <TextInput
          accessibilityLabel={label}
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          maxLength={3}
          style={[styles.toggleLabel, { width: suffix ? 40 : 56, textAlign: 'center', padding: 0 }]}
        />
        {suffix ? <Text style={styles.toggleLabel}>{suffix}</Text> : null}
      </View>
      <Pressable accessibilityLabel={t('ui.stepperIncrease', { label })} onPressIn={() => hold(1)} onPressOut={stop} style={styles.stepBtn}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.text, letterSpacing: -0.5 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  hint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  header: { height: 60, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  button: { borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { fontFamily: fonts.bold, fontSize: 16 },
  sosText: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1 },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 16, borderWidth: 1.5 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  toggleRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  toggleLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  switchTrack: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.lineStrong, padding: 3 },
  switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  bannerTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  bannerAction: { height: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  bannerActionText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onAccent },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  error: { fontFamily: fonts.semibold, fontSize: 14, color: colors.alarm },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
});
