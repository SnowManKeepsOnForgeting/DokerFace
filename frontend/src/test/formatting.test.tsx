import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import i18n, { resources } from '../i18n';
import { useEnumLabel } from '../i18n/useEnumLabel';
import { useFormatters } from '../i18n/useFormatters';

const TIMESTAMP = '2026-07-16T10:04:00Z';

describe('shared formatters', () => {
  it('groups chip amounts for the active language', () => {
    const { result } = renderHook(() => useFormatters());

    expect(result.current.formatChips(1234567)).toBe('1,234,567');
    expect(result.current.formatPercent(0.4237)).toBe('42.4%');
  });

  it('formats dates differently in English and Chinese', async () => {
    const { result, rerender } = renderHook(() => useFormatters());

    const english = result.current.formatDateTime(TIMESTAMP);
    expect(result.current.locale).toBe('en');

    await act(async () => {
      await i18n.changeLanguage('zh');
    });
    rerender();

    expect(result.current.locale).toBe('zh');
    expect(result.current.formatDateTime(TIMESTAMP)).not.toBe(english);
  });

  it('ignores unparsable dates instead of rendering Invalid Date', () => {
    const { result } = renderHook(() => useFormatters());

    expect(result.current.formatDate('not-a-date')).toBe('');
    expect(result.current.formatTime('')).toBe('');
  });
});

describe('enum dictionary', () => {
  it('translates backend enum values', async () => {
    const { result, rerender } = renderHook(() => useEnumLabel());

    expect(result.current('accountRole', 'administrator')).toBe('Administrator');
    expect(result.current('roomStatus', 'waiting')).toBe('Waiting');
    expect(result.current('endMode', 'winner_takes_all')).toBe('Winner takes all');
    expect(result.current('street', 'preflop')).toBe('Preflop');
    expect(result.current('action', 'bet_or_raise')).toBe('Bet or raise');
    expect(result.current('messageType', 'custom_quick')).toBe('Custom phrase');

    await act(async () => {
      await i18n.changeLanguage('zh');
    });
    rerender();

    expect(result.current('accountRole', 'administrator')).toBe('管理员');
    expect(result.current('accountStatus', 'disabled')).toBe('已停用');
    expect(result.current('roomVisibility', 'password')).toBe('密码');
    expect(result.current('endMode', 'winner_takes_all')).toBe('一人通吃');
    expect(result.current('street', 'river')).toBe('河牌');
    expect(result.current('action', 'check_or_call')).toBe('看牌或跟注');
  });

  it('falls back to a readable form for unknown values', () => {
    const { result } = renderHook(() => useEnumLabel());

    expect(result.current('roomStatus', 'future_state')).toBe('future state');
    expect(result.current('accountRole', null)).toBe('');
    expect(result.current('accountRole', undefined)).toBe('');
  });

  it('covers every enum value in both languages', () => {
    for (const [group, values] of Object.entries(resources.en.enums)) {
      const chineseGroup = resources.zh.enums[group as keyof typeof resources.zh.enums];
      expect(Object.keys(chineseGroup)).toEqual(Object.keys(values));
    }
  });
});
