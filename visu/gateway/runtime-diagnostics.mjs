// A PLC program cannot report its own STOP state. Observe a counter incremented
// from PLC_PRG and keep this separate from the OPC UA server's RUNNING state.
export class RuntimeHeartbeat {
  constructor(timeoutMs = 4_000) {
    this.timeoutMs = timeoutMs;
    this.reset();
  }

  reset() {
    this.counter = null;
    this.firstReadAt = null;
    this.lastReadAt = null;
    this.lastAdvancedAt = null;
  }

  observe(value, now = Date.now()) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
      this.reset();
      return this.snapshot(now);
    }
    if (this.counter === null) {
      this.firstReadAt = now;
    } else if (value !== this.counter) {
      this.lastAdvancedAt = now;
    }
    this.counter = value;
    this.lastReadAt = now;
    return this.snapshot(now);
  }

  snapshot(now = Date.now()) {
    const reference = this.lastAdvancedAt ?? this.firstReadAt;
    const mode = reference === null ? 'unknown'
      : now - reference >= this.timeoutMs ? 'stalled'
        : this.lastAdvancedAt === null ? 'verifying' : 'running';
    return {
      mode,
      counter: this.counter,
      lastReadAt: this.lastReadAt,
      lastAdvancedAt: this.lastAdvancedAt,
    };
  }
}
