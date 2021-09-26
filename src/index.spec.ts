import { mocked } from 'ts-jest/utils';
import redis, { RedisClient, createClient } from 'redis';
import { Compilation, Compiler, WebpackError } from 'webpack';
import { WebpackRedisPlugin } from '.';

describe('WebpackRedisPlugin', () => {
  let plugin: WebpackRedisPlugin;
  let client: jest.Mocked<RedisClient>;
  let compiler: jest.Mocked<Compiler>;
  let options: jest.Mocked<Required<Required<ConstructorParameters<typeof WebpackRedisPlugin>>[0]>>;

  beforeEach(() => {
    client = ({
      set: jest.fn((key, value, callback) => callback()),
      quit: jest.fn((callback) => callback()),
      end: jest.fn(),
    } as unknown) as typeof client;
    compiler = ({
      hooks: {
        afterEmit: { tapPromise: jest.fn() },
      },
      plugin: jest.fn(),
    } as unknown) as typeof compiler;
    options = ({
      config: {},
      filter: jest.fn(WebpackRedisPlugin.filter),
      transform: jest.fn(WebpackRedisPlugin.transform),
    } as unknown) as typeof options;
    plugin = new WebpackRedisPlugin(options);

    redis.createClient = jest.fn(() => client);
  });

  describe('apply', () => {
    it('should use hooks API', () => {
      plugin.apply(compiler);

      expect(compiler.hooks.afterEmit.tapPromise).toHaveBeenCalledTimes(1);
      expect(compiler.plugin).toHaveBeenCalledTimes(0);
    });

    it('should use plugin method', () => {
      delete (compiler as Partial<typeof compiler>).hooks;
      plugin.apply(compiler);

      expect(compiler.plugin).toHaveBeenCalledTimes(1);
      expect(compiler.plugin).toHaveBeenCalledWith('after-emit', expect.any(Function));
    });

    describe('afterEmit', () => {
      let afterEmit: Parameters<typeof compiler.hooks.afterEmit.tapPromise>[1];
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
        ([[, afterEmit]] = mocked(compiler.hooks.afterEmit.tapPromise).mock.calls);
      });

      it('should not run if there are compilation errors', async () => {
        compilation.errors.push(new WebpackError('error'));
        await afterEmit(compilation);

        expect(createClient).not.toHaveBeenCalled();
      });

      it('should initialize client using provided configuration', async () => {
        await afterEmit(compilation);

        expect(createClient).toHaveBeenCalledWith(options.config);
      });

      it('should initialize client only once', async () => {
        await afterEmit(compilation);

        expect(createClient).toHaveBeenCalledTimes(1);
      });

      it('should not run if there are compilation errors', async () => {
        compilation.errors.push(new WebpackError('error'));
        await afterEmit(compilation);

        expect(createClient).not.toHaveBeenCalled();
      });

      it('should save processed assets', async () => {
        await afterEmit(compilation);

        expect(client.set).toBeCalledTimes(2);
        expect(client.set).toHaveBeenCalledAfter(mocked(createClient));
        expect(client.set).toHaveBeenNthCalledWith(1, 'asset1', 'source1', expect.anything());
        expect(client.set).toHaveBeenNthCalledWith(2, 'asset2', 'source2', expect.anything());
      });

      it('should close connection in the end', async () => {
        await afterEmit(compilation);

        expect(client.quit).toBeCalledTimes(1);
        expect(client.quit).toHaveBeenCalledAfter(mocked(client.set));
      });

      it('should filter certain assets', async () => {
        options.filter.mockReturnValueOnce(true);
        options.filter.mockReturnValueOnce(false);
        await afterEmit(compilation);

        expect(client.set).toBeCalledTimes(1);
        expect(client.set).toHaveBeenCalledWith('asset1', 'source1', expect.anything());
      });

      it('should transform the value', async () => {
        options.transform.mockImplementation((key, asset) => ({
          key: `${key} ${key}`,
          value: `${asset.source()} ${asset.source()}`,
        }));
        await afterEmit(compilation);

        expect(client.set).toHaveBeenNthCalledWith(1, 'asset1 asset1', 'source1 source1', expect.anything());
        expect(client.set).toHaveBeenNthCalledWith(2, 'asset2 asset2', 'source2 source2', expect.anything());
      });

      it('should handle errors', async () => {
        const error = new Error('something');
        client.set.mockImplementationOnce(() => { throw error; });

        await afterEmit(compilation);

        expect(compilation.errors).toContainEqual(error);
        expect(client.end).toHaveBeenCalled();
      });
    });
  });
});
