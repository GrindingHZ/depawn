import type { Instant } from '../shared/instant';

export interface ClockPort {
  now(): Instant;
}

export const CLOCK_PORT = Symbol('ClockPort');
