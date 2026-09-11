import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { MarketKind, Quote } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber } from '@/lib/format';

const HEIGHT = 160;
const PAD = { top: 12, right: 12, bottom: 12, left: 44 };

/**
 * How a market's quote moved over time, one step per re-quote. Yes/No markets
 * draw the price (0–100) as a step line; Number markets draw each bid–ask as a
 * bar. A dashed line marks where the market settled.
 */
export function QuoteHistoryChart({
  kind,
  quotes,
  settleLevel,
}: {
  kind: MarketKind;
  quotes: readonly Quote[];
  /** The settled value: 0 or 100 for Yes/No, the real number for Number markets. */
  settleLevel: number | null;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const values =
    kind === 'binary'
      ? quotes.map((quote) => (quote.price ?? 0) * 100)
      : quotes.flatMap((quote) => [quote.bid ?? 0, quote.ask ?? 0]);
  let yMin = 0;
  let yMax = 100;
  if (kind === 'number') {
    const all = settleLevel === null ? values : [...values, settleLevel];
    const low = Math.min(...all);
    const high = Math.max(...all);
    const pad = high > low ? (high - low) * 0.15 : Math.max(1, high * 0.1);
    yMin = Math.max(0, low - pad);
    yMax = high + pad;
  }

  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) =>
    PAD.left + (quotes.length === 1 ? plotWidth / 2 : (index / (quotes.length - 1)) * plotWidth);
  const y = (value: number) => PAD.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;
  const ticks = kind === 'binary' ? [0, 50, 100] : [yMin, (yMin + yMax) / 2, yMax];

  const summary =
    kind === 'binary'
      ? `Price moved from ${Math.round(values[0])} to ${Math.round(values[values.length - 1])} over ${quotes.length} quotes.`
      : `Quote moved over ${quotes.length} quotes.`;

  return (
    <View onLayout={onLayout} accessible accessibilityLabel={summary} style={{ height: HEIGHT }}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {ticks.map((tick) => (
            <Line
              key={`grid-${tick}`}
              x1={PAD.left}
              x2={PAD.left + plotWidth}
              y1={y(tick)}
              y2={y(tick)}
              stroke={theme.border}
              strokeWidth={1}
            />
          ))}
          {ticks.map((tick) => (
            <SvgText
              key={`label-${tick}`}
              x={PAD.left - 6}
              y={y(tick) + 4}
              fontSize={10}
              fill={theme.textSecondary}
              textAnchor="end">
              {kind === 'binary' ? String(tick) : formatNumber(tick)}
            </SvgText>
          ))}

          {settleLevel !== null ? (
            <Line
              x1={PAD.left}
              x2={PAD.left + plotWidth}
              y1={y(settleLevel)}
              y2={y(settleLevel)}
              stroke={theme.text}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          ) : null}

          {kind === 'binary' ? (
            <>
              <Path
                d={values
                  .map((value, index) =>
                    index === 0 ? `M ${x(0)} ${y(value)}` : `H ${x(index)} V ${y(value)}`,
                  )
                  .join(' ')}
                stroke={theme.tint}
                strokeWidth={2}
                fill="none"
              />
              {values.map((value, index) => (
                <Circle key={index} cx={x(index)} cy={y(value)} r={4} fill={theme.tint} />
              ))}
            </>
          ) : (
            quotes.map((quote, index) => {
              const barWidth = Math.min(24, (plotWidth / quotes.length) * 0.5);
              const top = y(quote.ask ?? 0);
              const bottom = y(quote.bid ?? 0);
              return (
                <Rect
                  key={quote.id}
                  x={x(index) - barWidth / 2}
                  y={top}
                  width={barWidth}
                  height={Math.max(2, bottom - top)}
                  rx={3}
                  fill={theme.tint}
                  fillOpacity={0.3}
                  stroke={theme.tint}
                  strokeWidth={1.5}
                />
              );
            })
          )}
        </Svg>
      ) : null}
    </View>
  );
}
