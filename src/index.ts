import { callbackify, promisify } from 'util';
import { ClientOpts, RedisClient, createClient } from 'redis';
import { Asset, Compilation, Compiler, WebpackError, WebpackPluginInstance } from 'webpack';

type AsyncHook = Compiler['hooks']['afterEmit'];
type AsyncHookCallback = Parameters<AsyncHook['tapAsync']>[1];
type Source = Asset['source'];

declare module 'webpack' {
  class Compiler {
    plugin?(hook: 'after-emit', fn: AsyncHookCallback): void;
  }
}

interface KeyValuePair {
  /**
   * Redis key to be set.
   */
  key: string;

  /**
   * Value to be set.
   */
  value: string | Buffer;
}

interface WebpackRedisPluginOptions {
  /**
   * Redis client configuration.
   * @see https://www.npmjs.com/package/redis#options-object-properties
   */
  config?: ClientOpts;

  /**
   * The callback function to filter keys/assets that will be set in Redis.
   * By default, it is `() => true`.
   * @param key Relative asset path.
   * @param asset Webpack asset.
   */
  filter?(key: string, asset: Source): boolean;

  /**
   * The callback function transforms keys and values that will be set in Redis.
   * By default, it is `(key, asset) => ({ key, value: asset.source() })`.
   * @param key Relative asset path.
   * @param asset Webpack asset.
   * @returns A key-value pair.
   */
  transform?(key: string, asset: Source): KeyValuePair;
}

/**
 * Webpack Redis Plugin
 */
export default class WebpackRedisPlugin implements WebpackPluginInstance {
  /**
   * Default filter callback.
   */
  static filter(): boolean {
    return true;
  }

  /**
   * Default transform callback.
   * @param key Relative asset path.
   * @param asset Webpack asset.
   * @returns A key-value pair.
   */
  static transform(key: string, asset: Source): KeyValuePair {
    return { key, value: asset.source() };
  }

  private client?: RedisClient;

  private options: WebpackRedisPluginOptions & Required<Pick<WebpackRedisPluginOptions, 'filter' | 'transform'>>;

  /**
   * @param options Plugin options.
   */
  constructor({ config, filter = WebpackRedisPlugin.filter, transform = WebpackRedisPlugin.transform }: WebpackRedisPluginOptions = {}) {
    this.options = {
      config,
      filter,
      transform,
    };
  }

  protected getClient(): RedisClient {
    if (!this.client) {
      this.client = createClient(this.options.config)
    }

    return this.client;
  }

  protected async save({ key, value }: KeyValuePair): Promise<void> {
    const client = this.getClient();

    await promisify(client.set).call(client, key, value.toString());
  }

  private getAssets(compilation: Compilation) {
    return Object.entries(compilation.assets)
      .filter(([name, source]) => this.options.filter(name, source))
      .map(([name, source]) => this.options.transform(name, source));
  }

  private async afterEmit(compilation: Compilation) {
    if (compilation.errors.length) {
      return;
    }

    const client = this.getClient();
    try {
      const assets = this.getAssets(compilation);

      await Promise.all(assets.map(this.save.bind(this)));
      await promisify(client.quit).call(client);
    } catch (error) {
      client.end(true);
      compilation.errors.push(new WebpackError(error instanceof Error ? error.message : error as string));
    }
  }

  apply(compiler: Compiler): void {
    if (!compiler.hooks) {
      compiler.plugin?.('after-emit', callbackify(this.afterEmit).bind(this));

      return;
    }

    compiler.hooks.afterEmit.tapPromise({
      name: 'RedisPlugin',
      stage: Infinity
    }, this.afterEmit.bind(this));
  }
}
