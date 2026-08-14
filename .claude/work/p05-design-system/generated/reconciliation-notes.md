# Reconciliation notes

Three generator runs, one product. Decisions per the order in docs/13-design-system.md:

- Colour ramp: the marketplace run produced slate neutrals (0F172A, 1E293B, 334155) with a green
  accent (22C55E) and red destructive. The vault run produced the same slate family on a light
  surface; the admin run wandered into a green-tinted theme and is discarded. The shared ramp is
  slate neutrals on light surfaces with the green accent darkened to 15803D so white text on the
  accent meets WCAG AA, which the raw 22C55E does not.
- Light surfaces win over the marketplace run's dark background because all three apps are data
  dense and the vault console is read on a fixed terminal in a lit room; the vault run's surface
  values (F8FAFC background, 020617 foreground) carry the same hues.
- Fonts: the marketplace pairing wins (IBM Plex Sans for headings and body). Playfair Display and
  Fira Code from the other runs are dropped. IBM Plex Mono is the second family, for settlement
  references and tabular figures.
- Status colours are fixed by domain: neutral 64748B, active 0369A1 (from the vault run's
  accent), success 15803D, warning B45309, danger B91C1C. The generated destructive EF4444 and
  DC2626 fail AA as text on light surfaces and were darkened.
