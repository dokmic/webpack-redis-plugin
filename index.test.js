const WebpackRedisClient = require('./index'),
  redis = require('redis');

let plugin,
  listener,
  client,
  compilation;

beforeEach(() => {
  plugin = new WebpackRedisClient();
  redis.createClient = jest.fn(() => client);
  client = {
    set: jest.fn((key, value, callback) => callback()),
    addListener: jest.fn((event, callback) => listener = callback),
    removeListener: jest.fn(),
    quit: jest.fn(),
    end: jest.fn(),
  };
  compilation = {
    assets: {
      asset1: { source: () => 'source1' },
      asset2: { source: () => 'source2' },
    },
    errors: [],
  };
});

describe('getClient', () => {
  it('should create client', () => {
    plugin.options = { config: {} };

    expect(plugin.getClient()).toBe(client);
    expect(redis.createClient).toHaveBeenCalledWith(plugin.options.config);
  });

  it('should create client once', () => {
    plugin.getClient();
    plugin.getClient();
    expect(redis.createClient).toHaveBeenCalledTimes(1);
  });
});

describe('save', () => {
  it('should save', () => {
    expect.assertions(6);
    const promise = expect(plugin.save({ key: 'key', value: 'value' })).resolves.toBeUndefined();
    expect(client.set).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledWith('key', 'value', expect.any(Function));
    expect(client.addListener).toHaveBeenCalledTimes(1);
    expect(client.removeListener).toHaveBeenCalledTimes(1);
    expect(client.removeListener).toHaveBeenCalledWith('error', listener);

    return promise;
  });

  it('should reject', () => {
    client.set = jest.fn(() => listener('error'));

    expect.assertions(5);
    const promise = expect(plugin.save({ key: 'key', value: 'value' })).rejects.toEqual('error');
    expect(client.set).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledWith('key', 'value', expect.any(Function));
    expect(client.addListener).toHaveBeenCalledTimes(1);
    expect(client.removeListener).toHaveBeenCalledTimes(0);

    return promise;
  });
});

describe('getAssets', () => {
  it('should return all', () => {
    expect(plugin.getAssets(compilation)).toEqual([
      { key: 'asset1', value: 'source1' },
      { key: 'asset2', value: 'source2' },
    ]);
  });

  it('should filter', () => {
    plugin.options.filter = key => 'asset1' === key;

    expect(plugin.getAssets(compilation)).toEqual([
      { key: 'asset1', value: 'source1' },
    ]);
  });

  it('should transform', () => {
    plugin.options.transform = (key, asset) => Object({
      key: key + key,
      value: asset.source() + asset.source(),
    });

    expect(plugin.getAssets(compilation)).toEqual([
      { key: 'asset1asset1', value: 'source1source1' },
      { key: 'asset2asset2', value: 'source2source2' },
    ]);
  });
});

describe('afterEmit', () => {
  it('should succeed', () => {
    let cb = jest.fn();

    expect.assertions(5);

    return plugin.afterEmit(compilation, cb).then(() => {
      expect(client.set).toHaveBeenCalledTimes(2);
      expect(client.set).toHaveBeenNthCalledWith(1, 'asset1', 'source1', expect.anything());
      expect(client.set).toHaveBeenNthCalledWith(2, 'asset2', 'source2', expect.anything());
      expect(client.quit).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  it('should fail', () => {
    let cb = jest.fn();
    client.set = jest.fn(() => listener('error'));

    expect.assertions(5);

    return plugin.afterEmit(compilation, cb).then(() => {
      expect(client.set).toHaveBeenCalledTimes(2);
      expect(client.set).toHaveBeenCalledWith('asset1', 'source1', expect.anything());
      expect(client.end).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(compilation.errors).toEqual(['error']);
    });
  });

  it('should do nothing', () => {
    let cb = jest.fn();
    compilation.errors.push('error');
    plugin.getAssets = jest.fn();

    plugin.afterEmit(compilation, cb);
    expect(plugin.getAssets).toHaveBeenCalledTimes(0);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('apply', () => {
  it('should use hooks', () => {
    let compiler = {
      hooks: {
        afterEmit: { tap: jest.fn() },
      },
      plugin: jest.fn(),
    };

    plugin.apply(compiler);
    expect(compiler.hooks.afterEmit.tap).toHaveBeenCalledTimes(1);
    expect(compiler.plugin).toHaveBeenCalledTimes(0);
  });

  it('should use plugin', () => {
    let compiler = {
      plugin: jest.fn(),
    };

    plugin.apply(compiler);
    expect(compiler.plugin).toHaveBeenCalledTimes(1);
    expect(compiler.plugin).toHaveBeenCalledWith('after-emit', expect.any(Function));
  });
});
