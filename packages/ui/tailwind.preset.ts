import type { Config } from 'tailwindcss';

const preset: Omit<Config, 'content'> = {
  theme: {
    extend: {
      /* The motion and elevation tokens added in P8c, exposed as utilities so
         a component never has to reach for a raw duration. */
      transitionDuration: {
        control: 'var(--motion-control)',
        enter: 'var(--motion-enter)',
        panel: 'var(--motion-panel)',
      },
      transitionTimingFunction: {
        enter: 'var(--motion-ease-enter)',
        exit: 'var(--motion-ease-exit)',
      },
      boxShadow: {
        raised: 'var(--elevation-raised)',
        overlay: 'var(--elevation-overlay)',
      },
      colors: {
        surface: {
          base: 'var(--color-surface-base)',
          raised: 'var(--color-surface-raised)',
          sunken: 'var(--color-surface-sunken)',
        },
        ink: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          inverse: 'var(--color-text-inverse)',
        },
        edge: {
          DEFAULT: 'var(--color-border)',
        },
        accent: {
          DEFAULT: 'var(--color-accent-default)',
          hover: 'var(--color-accent-hover)',
        },
        status: {
          neutral: 'var(--color-status-neutral)',
          active: 'var(--color-status-active)',
          success: 'var(--color-status-success)',
          warning: 'var(--color-status-warning)',
          danger: 'var(--color-status-danger)',
        },
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      height: {
        row: 'var(--density-row-height)',
      },
      minHeight: {
        row: 'var(--density-row-height)',
      },
    },
  },
};

export default preset;
