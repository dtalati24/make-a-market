import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { calibrationLabel, dotRadius } from '@/lib/stats-view';
import type { CalibrationBin } from '@/scoring';

const HEIGHT = 240;
const PAD = { top: 14, right: 14, bottom: 42, left: 50 };
const GRID = [0.25, 0.5, 0.75, 1];
const TICKS = [0, 0.5, 1];
const CAP = 4;
const FONT = 11;

/**
 * Reliability diagram: your price (x) against how often it happened (y), one dot per
 * 10-point bucket with a 95% Wilson error bar. Dots on the dashed diagonal are calibrated.
 */
export function CalibrationChart({ bins }: { bins: readonly CalibrationBin[] }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  function onLayout(event: LayoutChangeEvent) {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }

  // Keep the plot roughly square, centred when the card is wide.
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const room = Math.max(0, width - PAD.left - PAD.right);
  const plotW = Math.min(room, plotH * 1.5);
  const left = PAD.left + (room - plotW) / 2;
  const x = (v: number) => left + v * plotW;
  const y = (v: number) => PAD.top + (1 - v) * plotH;
  const yTitleX = left - 36;

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={calibrationLabel(bins)}
      style={styles.container}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {GRID.map((v) => (
            <G key={`grid-${v}`}>
              <Line x1={x(v)} y1={y(0)} x2={x(v)} y2={y(1)} stroke={theme.border} strokeWidth={1} />
              <Line x1={x(0)} y1={y(v)} x2={x(1)} y2={y(v)} stroke={theme.border} strokeWidth={1} />
            </G>
          ))}
          <Line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(0)} stroke={theme.textSecondary} strokeWidth={1} />
          <Line x1={x(0)} y1={y(0)} x2={x(0)} y2={y(1)} stroke={theme.textSecondary} strokeWidth={1} />

          {TICKS.map((v) => (
            <G key={`tick-${v}`}>
              <SvgText x={x(v)} y={y(0) + 15} fontSize={FONT} fill={theme.textSecondary} textAnchor="middle">
                {`${v * 100}%`}
              </SvgText>
              <SvgText x={x(0) - 6} y={y(v) + 4} fontSize={FONT} fill={theme.textSecondary} textAnchor="end">
                {`${v * 100}%`}
              </SvgText>
            </G>
          ))}
          <SvgText
            x={x(0.5)}
            y={HEIGHT - 6}
            fontSize={FONT + 1}
            fontWeight="600"
            fill={theme.textSecondary}
            textAnchor="middle">
            Your price
          </SvgText>
          <SvgText
            x={yTitleX}
            y={y(0.5)}
            fontSize={FONT + 1}
            fontWeight="600"
            fill={theme.textSecondary}
            textAnchor="middle"
            transform={`rotate(-90 ${yTitleX} ${y(0.5)})`}>
            Happened
          </SvgText>

          <Line
            x1={x(0)}
            y1={y(0)}
            x2={x(1)}
            y2={y(1)}
            stroke={theme.textSecondary}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />

          {bins.map((bin) => {
            const cx = x(bin.meanP);
            const low = y(bin.ciLow);
            const high = y(bin.ciHigh);
            return (
              <G key={bin.index}>
                <Line x1={cx} y1={low} x2={cx} y2={high} stroke={theme.tint} strokeOpacity={0.55} strokeWidth={2} />
                <Line x1={cx - CAP} y1={low} x2={cx + CAP} y2={low} stroke={theme.tint} strokeOpacity={0.55} strokeWidth={2} />
                <Line
                  x1={cx - CAP}
                  y1={high}
                  x2={cx + CAP}
                  y2={high}
                  stroke={theme.tint}
                  strokeOpacity={0.55}
                  strokeWidth={2}
                />
                <Circle cx={cx} cy={y(bin.freq)} r={dotRadius(bin.n)} fill={theme.tint} stroke={theme.card} strokeWidth={1.5} />
              </G>
            );
          })}
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
