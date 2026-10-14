// Barvy a písma podle designu (tmavý „noční“ podklad, růžová pro seznamování, mátová pro bezpečí).

export const colors = {
  bg: '#121014',
  surface: '#1C181F',
  surface2: '#26212A',
  line: '#3A3340',
  lineSoft: '#2A2430',
  lineStrong: '#4A4250',
  text: '#F5EFE9',
  muted: '#B4AAB8',
  faint: '#8E8494',
  accent: '#FF6B8B',
  accentBg: '#2A1A20',
  safe: '#62E0B5',
  safeBg: '#15241F',
  safeLine: '#2E4A41',
  warn: '#F5B94A',
  warnBg: '#2A2418',
  warnLine: '#4A3E22',
  alarm: '#FF8A80',
  alarmBg: '#2A1918',
  alarmLine: '#4A2B28',
  sos: '#FF4B3E',
  onAccent: '#121014',
} as const;

export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

// Odstíny pro zástupné avatary bez fotky.
export const avatarTones = ['#3B2A35', '#2B3340', '#3A3328', '#2E3A33', '#33293D', '#283640'];
