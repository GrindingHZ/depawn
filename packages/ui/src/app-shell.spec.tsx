import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('renders the product name navigation and content', () => {
    render(
      <AppShell productName="depawn" navigation={<a href="/listings">Listings</a>}>
        <p>Content</p>
      </AppShell>,
    );
    expect(screen.getByText('depawn')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('switches density tokens for the terminal surface', () => {
    const { container } = render(
      <AppShell productName="depawn" navigation={null} surface="terminal">
        <p>Content</p>
      </AppShell>,
    );
    expect(container.querySelector("[data-surface='terminal']")).not.toBeNull();
  });
});
