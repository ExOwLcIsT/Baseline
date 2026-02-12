class CircuitBreakerConfig {
  failureThreshold: number = 3;
  windowSeconds: number = 300;
  cooldownSeconds: number = 600;
}
export default class CircuitBreaker {
  config: CircuitBreakerConfig;
  failures: number[];
  trippedAt?: number;
  constructor(config?: CircuitBreakerConfig) {
    this.config = config ?? new CircuitBreakerConfig();
    this.failures = [];
    this.trippedAt = undefined;
  }
  recordFailure() {
    const now = Date.now();
    this.failures.push(now);
    const cutoff = now - this.config.windowSeconds;
    this.failures = this.failures.filter((t) => t > cutoff);

    if (this.failures.length >= this.config.failureThreshold) this.trip();
  }
  recordSuccess() {
    this.trippedAt = undefined;
    this.failures = [];
  }
  trip() {
    this.trippedAt = Date.now();
    console.error("CIRCUIT BREAKER TRIPPED");
  }
  isOpen(): boolean {
    if (this.trippedAt == undefined) return false;
    if (Date.now() - this.trippedAt > this.config.cooldownSeconds) {
      this.trippedAt = undefined;
      this.failures = [];
      return false;
    }
    return true;
  }
  timeUntilReset(): number {
    if (this.trippedAt == undefined) return 0;
    return Math.max(
      0,
      this.config.cooldownSeconds - (Date.now() - this.trippedAt),
    );
  }
}
