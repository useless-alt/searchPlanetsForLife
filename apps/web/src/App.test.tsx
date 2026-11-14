import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import App from './App';
import { ru } from './i18n/ru';

afterEach(cleanup);

describe('App', () => {
  it('показывает заголовок приложения', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: ru['app.title'] })).toBeTruthy();
  });
});
