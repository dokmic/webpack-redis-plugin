# Webpack Redis Plugin

[![NPM](https://img.shields.io/npm/v/webpack-redis-plugin.svg)](https://www.npmjs.com/package/webpack-redis-plugin)
[![Build Status](https://github.com/dokmic/webpack-redis-plugin/actions/workflows/main.yaml/badge.svg?branch=master)](https://github.com/dokmic/webpack-redis-plugin/actions/workflows/main.yaml)
[![Code Coverage](https://codecov.io/gh/dokmic/webpack-redis-plugin/badge.svg?branch=master)](https://codecov.io/gh/dokmic/webpack-redis-plugin?branch=master)

This Webpack plugin provides an ability to save your assets in [Redis](https://redis.io/). The plugin supports _all_ the Webpack versions and is [tested](https://github.com/dokmic/webpack-redis-plugin/actions/workflows/main.yaml) with Webpack 2, 3, 4, and 5.

## Install
```bash
npm install --save-dev webpack-redis-plugin
```

## Usage
In your `webpack.config.js`:
```javascript
const { WebpackRedisPlugin } = require('webpack-redis-plugin');
const sha1 = require('sha1');

module.exports = {
  entry: {
    page1: [
      './src/page1/index.js',
    ],
    page2: [
      './src/page2/index.js',
    ],
  },

  output: {
    filename: 'js/[name].js',
  },

  // ...

  plugins: [
    new WebpackRedisPlugin({
      config: {
        host: 'redis.example.com',
        password: 'password',
      },

      filter: (key, asset) => key === 'js/page1.js' && asset.size(),

      transform: (key, asset) => ({
        key: `${key}.sha1`,
        value: sha1(asset.source().toString()),
      }),
    }),
  ],
};
```

This config tells the plugin to filter out everything except non-empty `js/page1.js` and save a hash sum of the contents at the `js/page1.js.sha1` key.

## API

### `options.config`
Redis client configuration. All possible options can be found [here](https://www.npmjs.com/package/redis#options-object-properties).

**Default:** `undefined`

### `options.filter`
The callback function to filter keys/assets that will be set in Redis:

```typescript
filter(key: string, asset: Source): boolean | Promise<boolean>;
```

- `key` - relative asset path.
- `asset` - Webpack asset.

**Default:** `() => true`

### `options.transform`
The callback function transforms keys and values that will be set in Redis:

```javascript
transform(key: string, asset: Source): KeyValuePair | Promise<KeyValuePair>
```

- `key` - relative asset path.
- `asset` - Webpack asset.

**Default:** `(key, asset) => ({ key, value: asset.source() })`
