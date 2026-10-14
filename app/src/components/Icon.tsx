import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/lib/theme';

// Tahové ikony z designu (bez emoji, bez ikonových fontů).
const paths = {
  back: ['M15 18l-6-6 6-6'],
  close: ['M6 6l12 12M18 6L6 18'],
  heart: ['M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z'],
  asterisk: ['M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9'],
  chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z'],
  user: ['M4 21c0-4 3.6-7 8-7s8 3 8 7'],
  shield: ['M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z'],
  shieldCheck: ['M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z', 'M9 11.5l2 2 4-4'],
  pin: ['M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z'],
  flag: ['M5 21V4M5 4h11l-2 4 2 4H5'],
  sliders: ['M4 7h10M18 7h2M4 17h4M12 17h8'],
  send: ['M5 12h14M13 6l6 6-6 6'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4'],
  plus: ['M12 5v14M5 12h14'],
  lock: ['M6 11h12v10H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  check: ['M5 12l5 5 9-10'],
  chevron: ['M9 6l6 6-6 6'],
} as const;

const circles: Partial<Record<keyof typeof paths, [number, number, number][]>> = {
  user: [[12, 8, 4]],
  pin: [[12, 9.5, 2.5]],
  sliders: [
    [16, 7, 2],
    [10, 17, 2],
  ],
  image: [[9, 9, 1.5]],
};

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 22,
  color = colors.text,
  strokeWidth = 2,
  fill = 'none',
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
  fill?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name].map((d) => (
        <Path key={d} d={d} />
      ))}
      {circles[name]?.map(([cx, cy, r]) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
      ))}
    </Svg>
  );
}
