/* eslint-disable max-classes-per-file */
import { callbackify, promisify } from 'util';
import { ClientOpts, RedisClient, createClient } from 'redis';
import { Asset, Compilation, Compiler, WebpackError, WebpackPluginInstance } from 'webpack';

type AssetEmittedHook = Compiler['hooks']['assetEmitted'];
type AssetEmittedCallback = Parameters<AssetEmittedHook['tapAsync']>[1];
type AssetEmittedInfo = Parameters<AssetEmittedCallback>[1];

type AsyncHook = Compiler['hooks']['afterEmit'];
type AsyncHookCallback = Parameters<AsyncHook['tapAsync']>[1];
type Source = Asset['source'];

declare module 'webpack' {
  // eslint-disable-next-line no-shadow
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
  filter?(key: string, asset: Source): boolean | Promise<boolean>;

  /**
   * The callback function transforms keys and values that will be set in Redis.
   * By default, it is `(key, asset) => ({ key, value: asset.source() })`.
   * @param key Relative asset path.
   * @param asset Webpack asset.
   * @returns A key-value pair.
   */
  transform?(key: string, asset: Source): KeyValuePair | Promise<KeyValuePair>;
}

function isWebpackBelow4(compiler: Compiler) {
  return !compiler.hooks;
}

function isWebpackBelow5(compiler: Compiler) {
  return !compiler.webpack?.version;
}

/**
 * Webpack Redis Plugin
 */
export class WebpackRedisPlugin implements WebpackPluginInstance {
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
  constructor({
    config,
    filter = WebpackRedisPlugin.filter,
    transform = WebpackRedisPlugin.transform,
  }: WebpackRedisPluginOptions = {}) {
    this.options = {
      config,
      filter,
      transform,
    };

    this.afterEmit = this.afterEmit.bind(this);
    this.assetEmitted = this.assetEmitted.bind(this);
  }

  protected getClient(): RedisClient {
    return createClient(this.options.config);
  }

  private async afterEmit(compilation: Compilation) {
    if (isWebpackBelow5(compilation.compiler)) {
      await Promise.all(
        Object.entries(compilation.assets).map(([name, source]) => this.assetEmitted(name, { compilation, source })),
      );
    }

    if (this.client) {
      await promisify(this.client.quit).call(this.client);
    }
  }

  private async assetEmitted(name: string, info: Pick<AssetEmittedInfo, 'compilation' | 'source'>) {
    try {
      if (!(await this.options.filter(name, info.source))) {
        return;
      }

      const { key, value } = await this.options.transform(name, info.source);

      if (!this.client) {
        this.client = this.getClient();
      }

      await promisify(this.client.set).call(this.client, key, value.toString());
    } catch (error) {
      info.compilation.errors.push(new WebpackError(error instanceof Error ? error.message : (error as string)));
    }
  }

  apply(compiler: Compiler): void {
    if (isWebpackBelow4(compiler)) {
      compiler.plugin?.('after-emit', callbackify(this.afterEmit));

      return;
    }

    if (!isWebpackBelow5(compiler)) {
      compiler.hooks.assetEmitted.tapPromise(
        {
          name: 'RedisPlugin',
          stage: Infinity,
        },
        this.assetEmitted,
      );
    }

    compiler.hooks.afterEmit.tapPromise(
      {
        name: 'RedisPlugin',
        stage: Infinity,
      },
      this.afterEmit,
    );
  }
}

export default WebpackRedisPlugin;
