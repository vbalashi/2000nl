import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { WordDetailDrawer } from '@/components/training/wordlist/WordDetailDrawer';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test('keeps a focused draft above the visual viewport bottom when the keyboard opens', () => {
  const viewport = new EventTarget() as VisualViewport;
  Object.assign(viewport, { height: 800, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  render(<WordDetailDrawer selection={null} draft={<input aria-label="Word" />} open onClose={() => {}} userId="u" contentLanguageCode="nl" translationLang="en" interfaceLanguage="ru" userLists={[]} />);
  const sheet = screen.getByRole('region');
  act(() => screen.getByLabelText('Word').focus());
  act(() => { Object.assign(viewport, { height: 500 }); viewport.dispatchEvent(new Event('resize')); });
  expect(parseFloat(sheet.style.bottom)).toBeGreaterThanOrEqual(300);
  expect(sheet.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
  act(() => { Object.assign(viewport, { height: 800 }); viewport.dispatchEvent(new Event('resize')); });
  expect(sheet.previousElementSibling).toBeNull();
});

test('does not save a temporary keyboard height when the app loses focus', () => {
  const viewport = new EventTarget() as VisualViewport;
  Object.assign(viewport, { height: 800, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  render(<WordDetailDrawer selection={null} draft={<input aria-label="Word" />} open onClose={() => {}} userId="u" contentLanguageCode="nl" translationLang="en" interfaceLanguage="ru" userLists={[]} />);
  const sheet = screen.getByRole('region');
  const initialHeight = sheet.style.height;
  vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue({ height: parseFloat(initialHeight) } as DOMRect);
  act(() => { Object.assign(viewport, { height: 500 }); viewport.dispatchEvent(new Event('resize')); });
  expect(sheet.style.height).toBe(initialHeight);
  act(() => { Object.assign(viewport, { height: 800 }); viewport.dispatchEvent(new Event('resize')); });
  expect(sheet.style.height).toBe(initialHeight);
});

test('keeps its position when the visual viewport is panned after unlock', () => {
  const viewport = new EventTarget() as VisualViewport;
  Object.assign(viewport, { height: 800, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('scrollY', 50);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  render(<WordDetailDrawer selection={null} draft={<input aria-label="Word" />} open onClose={() => {}} userId="u" contentLanguageCode="nl" translationLang="en" interfaceLanguage="ru" userLists={[]} />);
  act(() => screen.getByLabelText('Word').focus());
  act(() => { Object.assign(viewport, { height: 500, offsetTop: 50 }); viewport.dispatchEvent(new Event('scroll')); });
  expect(screen.getByRole('region')).toHaveStyle({ bottom: '308px' });
});

test('uses the visual pan when the layout viewport has not scrolled', () => {
  const viewport = new EventTarget() as VisualViewport;
  Object.assign(viewport, { height: 800, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('scrollY', 0);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  render(<WordDetailDrawer selection={null} draft={<input aria-label="Word" />} open onClose={() => {}} userId="u" contentLanguageCode="nl" translationLang="en" interfaceLanguage="ru" userLists={[]} />);
  act(() => screen.getByLabelText('Word').focus());
  act(() => { Object.assign(viewport, { height: 500, offsetTop: 50 }); viewport.dispatchEvent(new Event('scroll')); });
  expect(screen.getByRole('region')).toHaveStyle({ bottom: '258px' });
});
