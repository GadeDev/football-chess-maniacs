/* @vitest-environment jsdom */

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LanguageSelect from '../LanguageSelect';
import { LOCALE_NATIVE_NAMES, SUPPORTED_LOCALES, getLocale, setLocale } from '../index';

afterEach(() => {
  cleanup();
  setLocale('ja');
  localStorage.clear();
});

describe('LanguageSelect', () => {
  it('7言語をendonymで表示する', () => {
    render(<LanguageSelect />);
    const select = screen.getByRole('combobox', { name: '言語' });
    const options = Array.from(select.querySelectorAll('option'));
    expect(options.map((option) => option.value)).toEqual([...SUPPORTED_LOCALES]);
    expect(options.map((option) => option.textContent)).toEqual(
      SUPPORTED_LOCALES.map((locale) => LOCALE_NATIVE_NAMES[locale]),
    );
  });

  it('選択すると即時切替・永続化・html lang同期が動く', () => {
    render(<LanguageSelect />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'de' } });
    expect(getLocale()).toBe('de');
    expect(localStorage.getItem('fcms.locale')).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });
});
