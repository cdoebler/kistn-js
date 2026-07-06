import { InventoryPayload } from '../dto/types';

export interface CollectorInterface {
  collect(): InventoryPayload | null;
  /** Inventory ecosystem key. Every JS package manager maps to the single 'npm' ecosystem. */
  ecosystem(): string;
  lockFileHash(): string | null;
  isToolAvailable(): boolean;
  lockFiles(): Record<string, string>;
}
