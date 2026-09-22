import type { ConnectorSyncService } from "./syncService.js";

export class SyncScheduler {
  private isRunning = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly syncService: ConnectorSyncService,
    private readonly intervalMinutes: number,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.run();
    this.timer = setInterval(
      () => void this.run(),
      this.intervalMinutes * 60_000,
    );
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async run(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await this.syncService.syncConnectedSources();
    } finally {
      this.isRunning = false;
    }
  }
}
