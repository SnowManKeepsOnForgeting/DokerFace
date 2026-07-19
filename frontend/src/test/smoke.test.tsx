import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('Smoke test', () => {
  it('renders a simple component', () => {
    render(<div>Hello, DokerFace!</div>);
    expect(screen.getByText('Hello, DokerFace!')).toBeInTheDocument();
  });
});
