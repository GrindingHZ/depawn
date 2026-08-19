import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Field } from './field';
import { Select } from './select';

/* WCAG 1.4.11 puts the boundary of a control at 3:1 against its background.
   Every one of these carried --color-border, which is the hairline token at
   roughly 1.5:1: correct for a rule between two table rows and far too faint
   for the edge of something a person has to find and click. The two are now
   separate tokens and this is what stops them being confused again. */
describe('control boundaries', () => {
  it('outlines a text field with the strong border', () => {
    const { container } = render(<Field label="Principal" value="" onChange={() => {}} />);
    expect(container.querySelector('input')?.className).toContain('border-edge-strong');
  });

  it('outlines a select with the strong border', () => {
    const { container } = render(
      <Select label="Category" value="" onChange={() => {}}>
        <option value="">Anything</option>
      </Select>,
    );
    expect(container.querySelector('select')?.className).toContain('border-edge-strong');
  });

  it('outlines a checkbox with the strong border', () => {
    const { container } = render(<Checkbox label="Sealed" checked={false} onChange={() => {}} />);
    expect(container.querySelector('input')?.className).toContain('border-edge-strong');
  });

  it('outlines a secondary button with the strong border', () => {
    const { container } = render(<Button variant="secondary">Cancel</Button>);
    expect(container.querySelector('button')?.className).toContain('border-edge-strong');
  });

  /* An errored field keeps the danger colour, which is well above 3:1 and is
     carrying more meaning than a boundary. */
  it('leaves an errored field showing its error', () => {
    const { container } = render(
      <Field label="Principal" value="" onChange={() => {}} errorMessage="Too much" />,
    );
    expect(container.querySelector('input')?.className).toContain('border-status-danger');
  });
});
