export default class RateLimiter {
  window: [number, number][];
  maxWeight: number;
  constructor(maxWeightPerMin: number = 5000) {
    // 5000, not 6000 — safety margin
    this.window = []; // (timestamp, weight) pairs
    this.maxWeight = maxWeightPerMin;
  }
  canRequest(weight = 1): boolean {
    const now = Date.now() / 1000;
    // Remove entries older than 60s
    while (this.window.length && this.window[0][0] < now - 60) {
      this.window.shift();
    }
    const currentWeight = this.window.reduce(
      (sum, pair) => (sum += pair[1]),
      0,
    );
    return currentWeight + weight <= this.maxWeight;
  }
  record(weight = 1) {
    this.window.push([Date.now() / 1000, weight]);
  }
}
