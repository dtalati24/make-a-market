import { formatNumber, formatPercent, formatPrice, parseNumberInput } from '../format';

describe('formatPrice', () => {
  it('shows whole-number prices even with float noise', () => {
    expect(formatPrice(0.72)).toBe('72');
    expect(formatPrice(0.07)).toBe('7');
    expect(formatPrice(0.29)).toBe('29'); // 0.29 * 100 = 28.999999999999996
    expect(formatPrice(0.01)).toBe('1');
    expect(formatPrice(0.99)).toBe('99');
  });
});

describe('formatNumber', () => {
  it('drops trailing zeros and groups thousands', () => {
    expect(formatNumber(18)).toBe('18');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(3.5)).toBe('3.5');
    expect(formatNumber(1234.5)).toBe('1,234.5');
    expect(formatNumber(1_000_000)).toBe('1,000,000');
  });

  it('rounds to two decimals', () => {
    expect(formatNumber(0.125)).toBe('0.13');
    expect(formatNumber(2.004)).toBe('2');
    expect(formatNumber(-1234.567)).toBe('-1,234.57');
  });
});

describe('parseNumberInput', () => {
  it('parses plain numbers', () => {
    expect(parseNumberInput('12')).toBe(12);
    expect(parseNumberInput(' 12.5 ')).toBe(12.5);
    expect(parseNumberInput('.5')).toBe(0.5);
    expect(parseNumberInput('12.')).toBe(12);
    expect(parseNumberInput('1,200')).toBe(1200);
    expect(parseNumberInput('-3')).toBe(-3);
    expect(parseNumberInput('0')).toBe(0);
  });

  it('reads a lone comma as a decimal point, and 3-digit groups as thousands', () => {
    expect(parseNumberInput('2,5')).toBe(2.5);
    expect(parseNumberInput('0,75')).toBe(0.75);
    expect(parseNumberInput(',5')).toBe(0.5);
    expect(parseNumberInput('12,345.6')).toBe(12345.6);
    expect(parseNumberInput('1,234,567')).toBe(1234567);
    expect(parseNumberInput('1,2,3')).toBeNull();
    expect(parseNumberInput('1,2.5')).toBeNull();
    expect(parseNumberInput(',')).toBeNull();
  });

  it('rejects anything else', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('1e3')).toBeNull();
    expect(parseNumberInput('1.2.3')).toBeNull();
    expect(parseNumberInput('.')).toBeNull();
    expect(parseNumberInput('-')).toBeNull();
  });
});

describe('formatPercent', () => {
  it('rounds shares to whole percents', () => {
    expect(formatPercent(0.484)).toBe('48%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(1)).toBe('100%');
  });
});
