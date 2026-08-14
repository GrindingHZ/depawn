export class Instant {
  private constructor(readonly epochMilliseconds: bigint) {}

  static fromEpochMilliseconds(value: bigint): Instant {
    return new Instant(value);
  }

  plusMilliseconds(value: bigint): Instant {
    return new Instant(this.epochMilliseconds + value);
  }

  millisecondsSince(other: Instant): bigint {
    return this.epochMilliseconds - other.epochMilliseconds;
  }

  isAfter(other: Instant): boolean {
    return this.epochMilliseconds > other.epochMilliseconds;
  }

  isBefore(other: Instant): boolean {
    return this.epochMilliseconds < other.epochMilliseconds;
  }

  equals(other: Instant): boolean {
    return this.epochMilliseconds === other.epochMilliseconds;
  }
}
