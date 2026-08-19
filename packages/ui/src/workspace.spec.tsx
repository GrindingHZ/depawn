import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Workspace, WorkspacePrompt } from './workspace';

describe('Workspace', () => {
  it('renders both panes at once', () => {
    render(<Workspace browse={<p>browse pane</p>} detail={<p>detail pane</p>} />);
    expect(screen.getByText('browse pane')).toBeTruthy();
    expect(screen.getByText('detail pane')).toBeTruthy();
  });

  it('names each pane for assistive technology', () => {
    render(<Workspace browse={<p>browse</p>} detail={<p>detail</p>} />);
    expect(screen.getByLabelText('Live listings')).toBeTruthy();
    expect(screen.getByLabelText('Selected listing')).toBeTruthy();
  });

  it('renders the strip, spine and tape when given them', () => {
    render(
      <Workspace
        indexStrip={<p>strip</p>}
        browse={<p>browse</p>}
        detail={<p>detail</p>}
        spine={<p>spine</p>}
        tape={<p>tape</p>}
      />,
    );
    expect(screen.getByText('strip')).toBeTruthy();
    expect(screen.getByText('spine')).toBeTruthy();
    expect(screen.getByText('tape')).toBeTruthy();
  });

  /* The strip and the tape are conveniences. When their queries fail the
     workspace still has to work, so their absence leaves no gap. */
  it('stands up without the strip, spine or tape', () => {
    render(<Workspace browse={<p>browse</p>} detail={<p>detail</p>} />);
    expect(screen.getByText('browse')).toBeTruthy();
    expect(screen.getByText('detail')).toBeTruthy();
  });
});

describe('WorkspacePrompt', () => {
  /* Nothing is loading. The reader has not chosen yet, and a spinner would
     tell them to wait for something that is never going to arrive. */
  it('prompts rather than pretending to load', () => {
    render(<WorkspacePrompt title="Pick a listing" description="Choose one on the left." />);
    expect(screen.getByText('Pick a listing')).toBeTruthy();
    expect(screen.getByText('Choose one on the left.')).toBeTruthy();
  });
});
