import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { trendDomain } from '@/lib/stats-view';
import type { RollingPoint } from '@/scoring';

const HEIGHT = 160;
const PAD = { top: 12, right: 12, bottom: 22, left: 48 };
const FONT = 11;

/** A rolling-average line (x = settled-market number, y = value), with an optional dashed reference line. */
export function TrendChart({
  points,
  formatValue,
  label,
  reference,
  referenceLabel,
}: {
  points: readonly RollingPoint[];
  formatValue: (value: number) => string;
  /** What's plotted, for screen readers, e.g. "Rolling Brier". */
  label: string;
  reference?: number;
  referenceLabel?: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  if (points.length === 0) return null;

  function onLayout(event: LayoutChangeEvent) {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }

  const first = points[0];
  const last = points[points.length - 1];
  const domain = trendDomain(
    points.map((point) => point.value),
    reference,
  );
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const span = last.index - first.index;
  const x = (index: number) => PAD.left + (span === 0 ? plotW / 2 : ((index - first.index) / span) * plotW);
  const y = (value: number) => PAD.top + (1 - (value - domain.min) / (domain.max - domain.min)) * plotH;
  const path = points
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(' ');
  const summary =
    points.length === 1
      ? `${label}: ${formatValue(first.value)}.`
      : `${label} over ${points.length} points, from ${formatValue(first.value)} to ${formatValue(last.value)}.`;

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={summary} style={styles.container}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Line x1={PAD.left} y1={y(domain.max)} x2={PAD.left + plotW} y2={y(domain.max)} stroke={theme.border} strokeWidth={1} />
          <Line
            x1={PAD.left}
            y1={y(domain.min)}
            x2={PAD.left + plotW}
            y2={y(domain.min)}
            stroke={theme.textSecondary}
            strokeWidth={1}
          />
          <SvgText x={PAD.left - 6} y={y(domain.max) + 4} fontSize={FONT} fill={theme.textSecondary} textAnchor="end">
            {formatValue(domain.max)}
          </SvgText>
          <SvgText x={PAD.left - 6} y={y(domain.min) + 4} fontSize={FONT} fill={theme.textSecondary} textAnchor="end">
            {formatValue(domain.min)}
          </SvgText>

          {reference !== undefined ? (
            <Line
              x1={PAD.left}
              y1={y(reference)}
              x2={PAD.left + plotW}
              y2={y(reference)}
              stroke={theme.textSecondary}
              strokeWidth={1}
              strokeDasharray="5 4"
            />
          ) : null}
          {reference !== undefined && referenceLabel ? (
            <SvgText
              x={PAD.left + plotW}
              y={y(reference) - 5}
              fontSize={FONT - 1}
              fill={theme.textSecondary}
              textAnchor="end">
              {referenceLabel}
            </SvgText>
          ) : null}

          <Path d={path} stroke={theme.tint} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={x(last.index)} cy={y(last.value)} r={3.5} fill={theme.tint} />

          <SvgText
            x={span === 0 ? x(first.index) : PAD.left}
            y={HEIGHT - 6}
            fontSize={FONT}
            fill={theme.textSecondary}
            textAnchor={span === 0 ? 'middle' : 'start'}>
            {`#${first.index + 1}`}
          </SvgText>
          {span > 0 ? (
            <SvgText x={PAD.left + plotW} y={HEIGHT - 6} fontSize={FONT} fill={theme.textSecondary} textAnchor="end">
              {`#${last.index + 1}`}
            </SvgText>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: HEIGHT,
  },
});
