import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import i18n, { resources } from '../i18n';
import { useRealtimeError } from '../i18n/useRealtimeError';

describe('realtime error translation', () => {
  it('translates known Socket.IO error codes', async () => {
    const { result, rerender } = renderHook(() => useRealtimeError());

    expect(result.current('room_not_waiting')).toBe('The room is not waiting for players.');
    expect(result.current('not_current_actor')).toBe('It is not your turn.');

    await act(async () => {
      await i18n.changeLanguage('zh');
    });
    rerender();

    expect(result.current('room_not_waiting')).toBe('该房间不在等待状态。');
    expect(result.current('host_required')).toBe('只有房主可以执行该操作。');
    expect(result.current('invalid_password')).toBe('房间密码不正确。');
  });

  it('keeps unknown codes visible instead of crashing', async () => {
    const { result, rerender } = renderHook(() => useRealtimeError());

    expect(result.current('brand_new_backend_code')).toContain('brand_new_backend_code');
    expect(result.current(null)).toBe('Realtime error.');
    expect(result.current(undefined)).toBe('Realtime error.');

    await act(async () => {
      await i18n.changeLanguage('zh');
    });
    rerender();

    expect(result.current('brand_new_backend_code')).toContain('brand_new_backend_code');
    expect(result.current(null)).toBe('实时通信错误。');
  });

  it('keeps the English and Chinese error dictionaries aligned', () => {
    expect(Object.keys(resources.zh.errors.realtime)).toEqual(
      Object.keys(resources.en.errors.realtime),
    );
  });
});
