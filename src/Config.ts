import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TransmitMode, parseTransmitMode } from './TransmitMode';

interface RawConfig {
  base_url?: unknown;
  project_id?: unknown;
  token?: unknown;
  transmit_files?: unknown;
}

export class Config {
  private constructor(
    public readonly baseUrl: string,
    public readonly projectId: string,
    public readonly token: string,
    public readonly transmitFiles: TransmitMode,
  ) {}

  static async load(path: string): Promise<Config> {
    if (!existsSync(path)) {
      throw new Error(`Config file not found: ${path}`);
    }

    // SECURITY: a non-JSON config file is `import`ed, i.e. executed as code in this
    // process — anyone who can write kistn.config.js to the project root gets code
    // execution wherever this CLI runs (including CI). Treat the config file as trusted
    // input; use kistn.config.json (parsed, never executed) if that trust can't be assumed.
    //
    // Dynamic import handles both ESM (`export default {...}`) and CJS
    // (`module.exports = {...}`) consumer config files — Node's ESM loader
    // can import CJS modules, exposing module.exports as the `default` export.
    let raw: RawConfig;
    try {
      raw = path.endsWith('.json')
        ? JSON.parse(readFileSync(path, 'utf8'))
        : (await import(pathToFileURL(path).href)).default;
    } catch (error) {
      throw new Error(`Failed to load config file ${path}: ${(error as Error).message}`);
    }

    const baseUrl = process.env.KISTN_BASE_URL ?? raw.base_url;
    const projectId = process.env.KISTN_PROJECT_ID ?? raw.project_id;
    const token = process.env.KISTN_TOKEN ?? raw.token;

    for (const [key, value] of [['base_url', baseUrl], ['project_id', projectId], ['token', token]] as const) {
      if (typeof value !== 'string' || value === '') {
        throw new Error(`Config key '${key}' is missing or empty in ${path}`);
      }
    }

    return new Config(
      (baseUrl as string).replace(/\/+$/, ''),
      projectId as string,
      token as string,
      parseTransmitMode(typeof raw.transmit_files === 'string' ? raw.transmit_files : undefined),
    );
  }
}
