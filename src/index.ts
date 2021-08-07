import { ClientOpts, RedisClient, createClient } from 'redis';
import { Asset, Compilation, Compiler, WebpackPluginInstance } from 'webpack';

type AsyncHook = Compiler['hooks']['afterEmit'];
type AsyncHookCallback = Parameters<AsyncHook['tapAsync']>[1];
type InnerCallback = Parameters<AsyncHookCallback>[1];
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
  private client?: RedisClient;

  /**
   * @param options Plugin options.
   */
  constructor(private options: WebpackRedisPluginOptions = {}) {}

  protected getClient(): RedisClient {
    return this.client || (this.client = createClient(this.options.config));
  }

  protected save({ key, value }: KeyValuePair): Promise<void> {
    const client = this.getClient();

    return new Promise((resolve, reject) => {
      client.addListener('error', reject);
      client.set(key, value.toString(), () => {
        client.removeListener('error', reject);
        resolve();
      });
    });
  }

  private getAssets(compilation: Compilation) {
    return Object.keys(compilation.assets)
      .filter(key => !this.options.filter
        || this.options.filter(key, compilation.assets[key]))
      .map(key => this.options.transform
        ? this.options.transform(key, compilation.assets[key])
        : { key, value: compilation.assets[key].source() }
      );
  }

  private afterEmit(compilation: Compilation, callback?: InnerCallback) {
    if (compilation.errors.length) {
      return callback?.();
    }

    return Promise.all(
      this
        .getAssets(compilation)
        .map(this.save.bind(this))
    )
    .then(() => this.getClient().quit())
    .catch(error => {
      this.getClient().end(true);
      compilation.errors.push(error);
    })
    .then(() => callback?.());
  }

  apply(compiler: Compiler) {
    if (compiler.hooks) {
      compiler.hooks.afterEmit.tap({
        name: 'RedisPlugin',
        stage: Infinity
      }, this.afterEmit.bind(this));
    } else {
      compiler.plugin?.('after-emit', this.afterEmit.bind(this));
    }
  }
}
