export enum TransmitMode {
  Always = 'always',
  Never = 'never',
  OnDemand = 'on_demand',
}

export function parseTransmitMode(value: string | undefined): TransmitMode {
  if (value === TransmitMode.Always || value === TransmitMode.Never || value === TransmitMode.OnDemand) {
    return value;
  }
  return TransmitMode.Always;
}
