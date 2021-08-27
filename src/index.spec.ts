import { promisify } from 'util';
import { mocked } from 'ts-jest/utils';
import redis, { RedisClient, createClient } from 'redis';
import { Compilation, Compiler, WebpackError } from 'webpack';
import WebpackRedisPlugin from '.';

describe('WebpackRedisPlugin', () => {
  let plugin: WebpackRedisPlugin;
  let client: jest.Mocked<RedisClient>;
  let compiler: jest.Mocked<Compiler>;
  let options: jest.Mocked<Required<ConstructorParameters<typeof WebpackRedisPlugin>>[0]>;

  beforeEach(() => {
    client = ({
      set: jest.fn((key, value, callback) => callback()),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      quit: jest.fn(),
      end: jest.fn(),
    } as unknown) as typeof client;
    compiler = ({
      hooks: {
        afterEmit: { tap: jest.fn() },
      },
      plugin: jest.fn(),
    } as unknown) as typeof compiler;
    options = {
      config: {},
    };
    plugin = new WebpackRedisPlugin(options);

    redis.createClient = jest.fn(() => client);
  });

  describe('apply', () => {
    it('should use hooks API', () => {
      plugin.apply(compiler);

      expect(compiler.hooks.afterEmit.tap).toHaveBeenCalledTimes(1);
      expect(compiler.plugin).toHaveBeenCalledTimes(0);
    });

    it('should use plugin method', () => {
      delete (compiler as Partial<typeof compiler>).hooks;
      plugin.apply(compiler);

      expect(compiler.plugin).toHaveBeenCalledTimes(1);
      expect(compiler.plugin).toHaveBeenCalledWith('after-emit', expect.any(Function));
    });

    describe('afterEmit', () => {
      let afterEmit: Parameters<typeof compiler.hooks.afterEmit.tap>[1];
      let compilation: jest.Mocked<Compilation>;

      beforeEach(() => {
        compilation = ({
          assets: {
            asset1: { source: () => 'source1' },
            asset2: { source: () => 'source2' },
          },
          errors: [],
        } as unknown) as typeof compilation;

        plugin.apply(compiler);
        ([[, afterEmit]] = mocked(compiler.hooks.afterEmit.tap).mock.calls);
      });

      it('should not run if there are compilation errors', async () => {
        compilation.errors.push(new WebpackError('error'));
        await promisify(afterEmit)(compilation);

        expect(createClient).not.toHaveBeenCalled();
      });

      it('should initialize client using provided configuration', async () => {
        await promisify(afterEmit)(compilation);

        expect(createClient).toHaveBeenCalledWith(options.config);
      });

      it('should initialize client only once', async () => {
        await promisify(afterEmit)(compilation);

        expect(createClient).toHaveBeenCalledTimes(1);
      });

      it('should not run if there are compilation errors', async () => {
        compilation.errors.push(new WebpackError('error'));
        await promisify(afterEmit)(compilation);

        expect(createClient).not.toHaveBeenCalled();
      });

      it('should save processed assets', async () => {
        await promisify(afterEmit)(compilation);

        expect(client.set).toBeCalledTimes(2);
        expect(client.set).toHaveBeenCalledAfter(mocked(createClient));
        expect(client.set).toHaveBeenNthCalledWith(1, 'asset1', 'source1', expect.anything());
        expect(client.set).toHaveBeenNthCalledWith(2, 'asset2', 'source2', expect.anything());
      });

      it('should close connection in the end', async () => {
        await promisify(afterEmit)(compilation);

        expect(client.quit).toBeCalledTimes(1);
        expect(client.quit).toHaveBeenCalledAfter(mocked(client.set));
      });

      it('should filter certain assets', async () => {
        options.filter = jest.fn().mockReturnValueOnce(true);
        await promisify(afterEmit)(compilation);

        expect(client.set).toBeCalledTimes(1);
        expect(client.set).toHaveBeenCalledWith('asset1', 'source1', expect.anything());
      });

      it('should transform the value', async () => {
        options.transform = (key, asset) => ({
          key: `${key} ${key}`,
          value: `${asset.source()} ${asset.source()}`,
        });
        await promisify(afterEmit)(compilation);

        expect(client.set).toHaveBeenNthCalledWith(1, 'asset1 asset1', 'source1 source1', expect.anything());
        expect(client.set).toHaveBeenNthCalledWith(2, 'asset2 asset2', 'source2 source2', expect.anything());
      });

      it('should handle errors', async () => {
        const error = new Error('something');
        client.addListener.mockImplementationOnce((event, listener) => {
          listener(error);
          return client;
        });
        await promisify(afterEmit)(compilation);

        expect(compilation.errors).toContain(error);
        expect(client.end).toHaveBeenCalled();
      });
    });
  });
});
