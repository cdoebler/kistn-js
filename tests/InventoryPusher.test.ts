import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalHashCache } from '../src/cache/LocalHashCache';
import { CollectorInterface } from '../src/collectors/CollectorInterface';
import { InventoryPayload } from '../src/dto/types';
import { InventoryClientLike, InventoryPusher } from '../src/InventoryPusher';
import { TransmitMode } from '../src/TransmitMode';

function makePayload(name = 'lodash', version = '1.0.0'): InventoryPayload {
  return {
    packages: [{ name, version, ecosystem: 'npm', isDirect: true, isDev: false, depth: 0 }],
    findings: [],
    privatePackages: [],
  };
}

function makeCollector(overrides: Partial<CollectorInterface> = {}): CollectorInterface {
  return {
    ecosystem: () => 'npm',
    collect: () => makePayload(),
    lockFileHash: () => 'lockhash-1',
    isToolAvailable: () => true,
    lockFiles: () => ({ 'package-lock.json': '/path/to/package-lock.json' }),
    ...overrides,
  };
}

function makeClient(overrides: Partial<InventoryClientLike> = {}): InventoryClientLike {
  return {
    getHashes: vi.fn().mockResolvedValue({ npm: null }),
    push: vi.fn().mockResolvedValue(undefined),
    uploadFiles: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeCache(overrides: Partial<LocalHashCache> = {}): LocalHashCache {
  return {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    ...overrides,
  } as unknown as LocalHashCache;
}

describe('InventoryPusher', () => {
  let client: InventoryClientLike;
  let cache: LocalHashCache;

  beforeEach(() => {
    client = makeClient();
    cache = makeCache();
  });

  it('skips collection entirely when local lockfile hash cache matches', async () => {
    cache = makeCache({ get: vi.fn().mockReturnValue('lockhash-1') } as Partial<LocalHashCache>);
    const collectSpy = vi.fn().mockReturnValue(makePayload());
    const collector = makeCollector({ collect: collectSpy, lockFileHash: () => 'lockhash-1' });

    const pusher = new InventoryPusher(client, [collector], cache);
    await pusher.pushAll();

    expect(collectSpy).not.toHaveBeenCalled();
    expect(client.push).not.toHaveBeenCalled();
  });

  it('calls getHashes once regardless of collector count', async () => {
    const collector1 = makeCollector({ ecosystem: () => 'npm' });
    const collector2 = makeCollector({ ecosystem: () => 'composer', lockFiles: () => ({}) });
    client = makeClient({ getHashes: vi.fn().mockResolvedValue({ npm: null, composer: null }) });

    const pusher = new InventoryPusher(client, [collector1, collector2], cache);
    await pusher.pushAll();

    expect(client.getHashes).toHaveBeenCalledTimes(1);
  });

  it('skips push when content hash matches server hash, and caches lockfile hash', async () => {
    const payload = makePayload();
    const { computeHash } = await import('../src/HashComputer');
    const contentHash = computeHash(payload);

    client = makeClient({ getHashes: vi.fn().mockResolvedValue({ npm: contentHash }) });
    const collector = makeCollector({ collect: () => payload });

    const pusher = new InventoryPusher(client, [collector], cache);
    await pusher.pushAll();

    expect(client.push).not.toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalledWith('npm', 'lockhash-1');
  });

  it('bundles multiple changed ecosystems in a single push call', async () => {
    client = makeClient({ getHashes: vi.fn().mockResolvedValue({ npm: null, composer: null }) });
    const npmCollector      = makeCollector({ ecosystem: () => 'npm', lockFiles: () => ({}) });
    const composerCollector = makeCollector({ ecosystem: () => 'composer', lockFiles: () => ({}) });

    const pusher = new InventoryPusher(client, [npmCollector, composerCollector], cache);
    await pusher.pushAll();

    expect(client.push).toHaveBeenCalledTimes(1);
    const callArg = (client.push as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg).toHaveProperty('npm');
    expect(callArg).toHaveProperty('composer');
  });

  it('pushes and uploads files when TransmitMode.Always', async () => {
    const collector = makeCollector();
    const pusher = new InventoryPusher(client, [collector], cache, TransmitMode.Always);
    await pusher.pushAll();

    expect(client.push).toHaveBeenCalledWith(expect.objectContaining({ npm: expect.any(Object) }));
    expect(client.uploadFiles).toHaveBeenCalledWith({ 'package-lock.json': '/path/to/package-lock.json' });
  });

  it('does not upload files when no TransmitMode is given', async () => {
    const pusher = new InventoryPusher(client, [makeCollector()], cache);
    await pusher.pushAll();

    expect(client.push).toHaveBeenCalledTimes(1);
    expect(client.uploadFiles).not.toHaveBeenCalled();
  });

  it('does not upload files when TransmitMode.Never', async () => {
    const collector = makeCollector();
    const pusher = new InventoryPusher(client, [collector], cache, TransmitMode.Never);
    await pusher.pushAll();

    expect(client.push).toHaveBeenCalledTimes(1);
    expect(client.uploadFiles).not.toHaveBeenCalled();
  });

  it('uploads files under TransmitMode.OnDemand only when PM tool is unavailable', async () => {
    const collectorAvailable = makeCollector({ isToolAvailable: () => true });
    const pusher = new InventoryPusher(client, [collectorAvailable], cache, TransmitMode.OnDemand);
    await pusher.pushAll();

    expect(client.push).toHaveBeenCalledTimes(1);
    expect(client.uploadFiles).not.toHaveBeenCalled();
  });

  it('uploads files under TransmitMode.OnDemand when PM tool is unavailable', async () => {
    const collectorUnavailable = makeCollector({ isToolAvailable: () => false });
    const pusher = new InventoryPusher(client, [collectorUnavailable], cache, TransmitMode.OnDemand);
    await pusher.pushAll();

    expect(client.push).toHaveBeenCalledTimes(1);
    expect(client.uploadFiles).toHaveBeenCalledWith({ 'package-lock.json': '/path/to/package-lock.json' });
  });

  it('returns early without pushing when collect() returns null', async () => {
    const collector = makeCollector({ collect: () => null });
    const pusher = new InventoryPusher(client, [collector], cache);
    await pusher.pushAll();

    expect(client.push).not.toHaveBeenCalled();
  });

  it('does not call uploadFiles when lockFiles() returns empty object', async () => {
    const collector = makeCollector({ lockFiles: () => ({}) });
    const pusher = new InventoryPusher(client, [collector], cache, TransmitMode.Always);
    await pusher.pushAll();

    expect(client.push).toHaveBeenCalledTimes(1);
    expect(client.uploadFiles).not.toHaveBeenCalled();
  });

  it('combines lock files from multiple ecosystems into single uploadFiles call', async () => {
    client = makeClient({ getHashes: vi.fn().mockResolvedValue({ npm: null, composer: null }) });
    const npmCollector      = makeCollector({ ecosystem: () => 'npm',      lockFiles: () => ({ package_lock: '/npm/package-lock.json' }) });
    const composerCollector = makeCollector({ ecosystem: () => 'composer', lockFiles: () => ({ composer_lock: '/composer/composer.lock' }) });

    const pusher = new InventoryPusher(client, [npmCollector, composerCollector], cache, TransmitMode.Always);
    await pusher.pushAll();

    expect(client.uploadFiles).toHaveBeenCalledTimes(1);
    expect(client.uploadFiles).toHaveBeenCalledWith({
      package_lock: '/npm/package-lock.json',
      composer_lock: '/composer/composer.lock',
    });
  });
});
