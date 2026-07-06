export interface Package {
  name: string;
  version: string;
  ecosystem: string;
  isDirect: boolean;
  isDev: boolean;
  depth: number | null;
  availableVersion?: string | null;
}

export interface Finding {
  packageName: string;
  packageVersion: string;
  advisoryId: string;
  severity: string;
}

export interface InventoryPayload {
  packages: Package[];
  findings: Finding[];
  privatePackages: string[];
}

export function createInventoryPayload(
  packages: Package[],
  findings: Finding[] = [],
  privatePackages: string[] = [],
): InventoryPayload {
  return { packages, findings, privatePackages };
}
