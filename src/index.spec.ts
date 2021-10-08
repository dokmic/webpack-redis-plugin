import { mocked } from 'ts-jest/utils';
import { RedisClient, createClient } from 'redis';
import { Compilation, Compiler } from 'webpack';
import { WebpackRedisPlugin } from '.';

jest.mock('redis', () => ({ createClient: jest.fn() }));

describe('WebpackRedisPlugin', () => {
  let client: jest.Mocked<RedisClient>;
  let compilation: jest.Mocked<Compilation>;
  let compiler: jest.Mocked<Compiler>;
  let options: jest.Mocked<Required<Required<ConstructorParameters<typeof WebpackRedisPlugin>>[0]>>;
  let plugin: WebpackRedisPlugin;

  beforeEach(() => {
    client = {
      set: jest.fn((key, value, callback) => callback()),
      quit: jest.fn((callback) => callback()),
    } as unknown as typeof client;
    compiler = {
      hooks: {
        afterEmit: { tapPromise: jest.fn() },
        assetEmitted: { tapPromise: jest.fn() },
      },
      plugin: jest.fn(),
      webpack: {
        version: '5.0.0',
      },
    } as unknown as typeof compiler;
    compilation = { compiler, errors: [] } as unknown as typeof compilation;
    options = {
      config: {},
      filter: jest.fn(WebpackRedisPlugin.filter),
      transform: jest.fn(WebpackRedisPlugin.transform),
    } as unknown as typeof options;
    plugin = new WebpackRedisPlugin(options);

    jest.clearAllMocks();
    mocked(createClient).mockReturnValue(client);
  });

  describe('apply', () => {
    describe('when webpack 3 and below', () => {
      beforeEach(() => {
        delete (compiler as Partial<typeof compiler>).hooks;
        delete (compiler as Partial<typeof compiler>).webpack;

        plugin.apply(compiler);
      });

      it('should use plugin method', () => {
        expect(compiler.plugin).toHaveBeenCalledTimes(1);
        expect(compiler.plugin).toHaveBeenCalledWith('after-emit', expect.any(Function));
      });
    });

    describe('when webpack 4', () => {
      beforeEach(async () => {
        delete (compiler as Partial<typeof compiler>).webpack;

        plugin.apply(compiler);
        const [[, afterEmit]] = mocked(compiler.hooks.afterEmit.tapPromise).mock.calls;
        await afterEmit({
          ...compilation,
          assets: {
            asset1: { source: () => 'source1' },
            asset2: { source: () => 'source2' },
          },
        } as unknown as typeof compilation);
      });

      it('should not tap into assetEmitted hook', () => {
        expect(compiler.hooks.assetEmitted.tapPromise).not.toHaveBeenCalled();
      });

      it('should save processed assets', async () => {
        expect(client.set).toBeCalledTimes(2);
        expect(client.set).toHaveBeenCalledAfter(mocked(createClient));
        expect(client.set).toHaveBeenNthCalledWith(1, 'asset1', 'source1', expect.anything());
        expect(client.set).toHaveBeenNthCalledWith(2, 'asset2', 'source2', expect.anything());
      });
    });

    describe('when webpack 5 and above', () => {
      let afterEmit: Parameters<typeof compiler.hooks.afterEmit.tapPromise>[1];
      let assetEmitted: Parameters<typeof compiler.hooks.assetEmitted.tapPromise>[1];

      beforeEach(() => {
        plugin.apply(compiler);
        [[, afterEmit]] = mocked(compiler.hooks.afterEmit.tapPromise).mock.calls;
        [[, assetEmitted]] = mocked(compiler.hooks.assetEmitted.tapPromise).mock.calls;
      });

      async function emit() {
        // @ts-expect-error skip unused properties
        await assetEmitted('asset1', { compilation, source: { source: () => 'source1' } });
        // @ts-expect-error skip unused properties
        await assetEmitted('asset2', { compilation, source: { source: () => 'source2' } });
        await afterEmit(compilation);
      }

      it('should tap into hooks', () => {
        expect(compiler.hooks.assetEmitted.tapPromise).toHaveBeenCalledTimes(1);
        expect(compiler.hooks.afterEmit.tapPromise).toHaveBeenCalledTimes(1);
        expect(compiler.plugin).toHaveBeenCalledTimes(0);
      });

      it('should initialize client using provided configuration', async () => {
        await emit();

        expect(createClient).toHaveBeenCalledWith(options.config);
      });

      it('should initialize client only once', async () => {
        await emit();

        expect(createClient).toHaveBeenCalledTimes(1);
      });

      it('should not initialize client if the were no assets', async () => {
        await afterEmit(compilation);

        expect(createClient).not.toHaveBeenCalled();
      });

      it('should save processed assets', async () => {
        await emit();

        expect(client.set).toBeCalledTimes(2);
        expect(client.set).toHaveBeenCalledAfter(mocked(createClient));
        expect(client.set).toHaveBeenNthCalledWith(1, 'asset1', 'source1', expect.anything());
        expect(client.set).toHaveBeenNthCalledWith(2, 'asset2', 'source2', expect.anything());
      });

      it('should close connection in the end', async () => {
        await emit();

        expect(client.quit).toBeCalledTimes(1);
        expect(client.quit).toHaveBeenCalledAfter(mocked(client.set));
      });

      it('should filter certain assets', async () => {
        options.filter.mockReturnValueOnce(true);
        options.filter.mockReturnValueOnce(false);
        await emit();

        expect(client.set).toBeCalledTimes(1);
        expect(client.set).toHaveBeenCalledWith('asset1', 'source1', expect.anything());
      });

      it('should transform the value', async () => {
        options.transform.mockImplementation((key, asset) => ({
          key: `${key} ${key}`,
          value: `${asset.source()} ${asset.source()}`,
        }));

        await emit();

        expect(client.set).toHaveBeenNthCalledWith(1, 'asset1 asset1', 'source1 source1', expect.anything());
        expect(client.set).toHaveBeenNthCalledWith(2, 'asset2 asset2', 'source2 source2', expect.anything());
      });

      it('should support asynchronous callback options', async () => {
        options.filter.mockResolvedValueOnce(false);
        options.filter.mockResolvedValueOnce(true);
        options.transform.mockResolvedValueOnce({ key: 'something', value: 'something' });
        await emit();

        expect(client.set).toBeCalledTimes(1);
        expect(client.set).toHaveBeenCalledWith('something', 'something', expect.anything());
      });

      it('should handle errors', async () => {
        options.filter.mockImplementationOnce(() => {
          // eslint-disable-next-line no-throw-literal
          throw 'error1';
        });

        client.set.mockImplementationOnce(() => {
          throw new Error('error2');
        });

        await emit();

        expect(compilation.errors).toContainEqual(new Error('error1'));
        expect(compilation.errors).toContainEqual(new Error('error2'));
        expect(client.quit).toHaveBeenCalled();
      });

      it('should save processed assets', async () => {
        await emit();

        expect(client.set).toBeCalledTimes(2);
        expect(client.set).toHaveBeenCalledAfter(mocked(createClient));
        expect(client.set).toHaveBeenNthCalledWith(1, 'asset1', 'source1', expect.anything());
        expect(client.set).toHaveBeenNthCalledWith(2, 'asset2', 'source2', expect.anything());
      });
    });
  });
});
