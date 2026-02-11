import Signal from "../strategy/Signal.js";

export default class ReplayProtection {
  executed: [string, number][];
  ttl: number;
  constructor(ttlSeconds: number = 60) {
    this.executed = [];
    this.ttl = ttlSeconds;
  }
  isDuplicate(signal: Signal): boolean {
    this.cleanup();
    return signal.signalId in this.executed;
  }
  markExecuted(signal: Signal) {
    this.executed.push([signal.signalId, Date.now()]);
  }
  cleanup() {
    const cutoff = Date.now() - this.ttl;
    this.executed = this.executed.filter((pair) => pair[1] > cutoff);
  }
}
