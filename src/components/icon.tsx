import Svg, { Path } from 'react-native-svg';

export type IconName = 'plus' | 'minus' | 'search' | 'chevron-right' | 'close' | 'check';

// 24×24 stroke paths.
const PATHS: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M16.2 16.2L20 20',
  'chevron-right': 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
};

export function Icon({
  name,
  color,
  size = 20,
  strokeWidth = 2,
}: {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={PATHS[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
