import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LifecycleSpine, spineFor } from './lifecycle-spine';

describe('spineFor', () => {
  /* Not one sequence renamed. The borrower is walking an item out and back;
     the lender is walking money out and hoping it returns. */
  it('walks the borrower from receipt to redemption', () => {
    expect(spineFor('borrower', 'ACTIVE').map((stage) => stage.label)).toEqual([
      'Receipt',
      'Listed',
      'Funded',
      'Maturing',
      'Redeemed',
    ]);
  });

  it('walks the lender from an open listing to settlement', () => {
    expect(spineFor('lender', 'ACTIVE').map((stage) => stage.label)).toEqual([
      'Open',
      'Your offer',
      'Funded',
      'Default risk',
      'Settled',
    ]);
  });

  /* Telling somebody they have offered when they have not is the same class
     of quiet lie as painting a falling rate green for both sides. */
  it('leaves a lender who has not offered at open, not at their own offer', () => {
    expect(spineFor('lender', 'ACTIVE').find((stage) => stage.state === 'current')?.label).toBe(
      'Open',
    );
  });

  it('moves a lender onto their own offer once they have one', () => {
    expect(
      spineFor('lender', 'ACTIVE', { hasLiveOffer: true }).find(
        (stage) => stage.state === 'current',
      )?.label,
    ).toBe('Your offer');
  });

  it('marks exactly one stage as the one happening now', () => {
    const stages = spineFor('borrower', 'ACTIVE');
    expect(stages.filter((stage) => stage.state === 'current')).toHaveLength(1);
  });

  it('puts everything before the current stage behind it', () => {
    const stages = spineFor('borrower', 'MATCHED');
    expect(stages.slice(0, 2).every((stage) => stage.state === 'done')).toBe(true);
    expect(stages[2]?.state).toBe('current');
    expect(stages.slice(3).every((stage) => stage.state === 'ahead')).toBe(true);
  });

  it('moves the lender onto the risk stage when the loan defaults', () => {
    const stages = spineFor('lender', 'DEFAULTED');
    expect(stages.find((stage) => stage.key === 'risk')?.state).toBe('risk');
  });

  /* A defaulted loan is the lender's problem to act on and the borrower's
     item still sitting in a vault. Same event, different stage. */
  it('leaves the defaulted borrower at maturing rather than at risk', () => {
    expect(
      spineFor('borrower', 'DEFAULTED').find((stage) => stage.state === 'current')?.label,
    ).toBe('Maturing');
  });

  it('flags a stage at risk when asked, wherever the reader is', () => {
    const stages = spineFor('borrower', 'LOAN_MATURING', { isAtRisk: true });
    expect(stages.find((stage) => stage.label === 'Maturing')?.state).toBe('risk');
  });

  it('opens at the first stage for a status it does not recognise', () => {
    const stages = spineFor('borrower', 'SOMETHING_NEW');
    expect(stages[0]?.state).toBe('current');
  });
});

describe('LifecycleSpine', () => {
  it('renders a stage per step', () => {
    render(<LifecycleSpine role="borrower" stages={spineFor('borrower', 'ACTIVE')} />);
    expect(screen.getByText('Receipt')).toBeTruthy();
    expect(screen.getByText('Redeemed')).toBeTruthy();
  });

  /* The dot is a coloured circle, which is colour as the only signal unless
     the state is also said out loud. */
  it('says each stage state in words', () => {
    render(<LifecycleSpine role="borrower" stages={spineFor('borrower', 'MATCHED')} />);
    expect(screen.getAllByText(/, done/).length).toBeGreaterThan(0);
    expect(screen.getByText(/, now/)).toBeTruthy();
  });

  it('marks the current stage for assistive technology', () => {
    const { container } = render(
      <LifecycleSpine role="borrower" stages={spineFor('borrower', 'MATCHED')} />,
    );
    const current = container.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain('Funded');
  });

  it('names itself differently to each side', () => {
    const { unmount } = render(
      <LifecycleSpine role="borrower" stages={spineFor('borrower', 'ACTIVE')} />,
    );
    expect(screen.getByLabelText('Your item, stage by stage')).toBeTruthy();
    unmount();

    render(<LifecycleSpine role="lender" stages={spineFor('lender', 'ACTIVE')} />);
    expect(screen.getByLabelText('Your position, stage by stage')).toBeTruthy();
  });

  it('reports which stage was chosen', () => {
    const onSelectStage = vi.fn();
    render(
      <LifecycleSpine
        role="borrower"
        stages={spineFor('borrower', 'ACTIVE')}
        onSelectStage={onSelectStage}
      />,
    );
    fireEvent.click(screen.getByText('Funded'));
    expect(onSelectStage).toHaveBeenCalledWith('funded');
  });
});
