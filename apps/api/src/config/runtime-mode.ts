/* Two processes need a clock they can move: the test suite, which pushes a
   loan past maturity, and a demo, which does the same in front of an
   audience. Everything else must be unable to, so the switch is read once
   here and both the clock and the route guard ask this rather than each
   inventing its own reading of the environment. */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

export function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test';
}

export function hasAdvanceableClock(): boolean {
  return isTestMode() || isDemoMode();
}
