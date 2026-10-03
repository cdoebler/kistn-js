import { LocalHashCache } from './cache/LocalHashCache';
import { CollectorInterface } from './collectors/CollectorInterface';
import { InventoryPayload } from './dto/types';
import { computeHash } from './HashComputer';
import { TransmitMode } from './TransmitMode';

export interface InventoryClientLike {
  getHashes(): Promise<Record<string, string | null>>;
  push(payloads: Record<string, InventoryPayload>): Promise<void>;
  uploadFiles(filePaths: Record<string, string>): Promise<void>;
}

export class InventoryPusher {
  constructor(
    private readonly client: InventoryClientLike,
    private readonly collectors: CollectorInterface[],
    private readonly cache: LocalHashCache,
    private readonly transmitFiles: TransmitMode = TransmitMode.Never,
  ) {}

  async pushAll(): Promise<void> {
    const serverHashes = await this.client.getHashes();

    const payloads: Record<string, InventoryPayload> = {};
    const uploadFiles: Record<string, string> = {};
    const pushedLockHashes: Record<string, string> = {};

    for (const collector of this.collectors) {
      const ecosystem = collector.ecosystem();
      const serverHash = serverHashes[ecosystem] ?? null;

      const cachedLockHash = this.cache.get(ecosystem);
      const localLockHash = collector.lockFileHash();

      if (cachedLockHash !== null && localLockHash !== null && cachedLockHash === localLockHash) {
        continue;
      }

      const payload = collector.collect();
      if (payload === null) {
        continue;
      }

      const contentHash = computeHash(payload);
      if (contentHash === serverHash) {
        if (localLockHash !== null) {
          this.cache.set(ecosystem, localLockHash);
        }
        continue;
      }

      payloads[ecosystem] = payload;

      if (localLockHash !== null) {
        pushedLockHashes[ecosystem] = localLockHash;
      }

      const lockFiles = collector.lockFiles();
      if (this.shouldUploadFiles(collector) && Object.keys(lockFiles).length > 0) {
        Object.assign(uploadFiles, lockFiles);
      }
    }

    if (Object.keys(payloads).length === 0) {
      return;
    }

    await this.client.push(payloads);

    if (Object.keys(uploadFiles).length > 0) {
      await this.client.uploadFiles(uploadFiles);
    }

    for (const [ecosystem, lockHash] of Object.entries(pushedLockHashes)) {
      this.cache.set(ecosystem, lockHash);
    }
  }

  private shouldUploadFiles(collector: CollectorInterface): boolean {
    switch (this.transmitFiles) {
      case TransmitMode.Always:
        return true;
      case TransmitMode.Never:
        return false;
      case TransmitMode.OnDemand:
        return !collector.isToolAvailable();
    }
  }
}
