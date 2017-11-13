# Webpack Redis Plugin

[![NPM](https://img.shields.io/npm/v/webpack-redis-plugin.svg)](https://www.npmjs.com/package/webpack-redis-plugin)
[![Build Status](https://travis-ci.org/dokmic/webpack-redis-plugin.svg?branch=master)](https://travis-ci.org/dokmic/webpack-redis-plugin)
[![Code Coverage](https://codecov.io/gh/dokmic/webpack-redis-plugin/badge.svg?branch=master)](https://codecov.io/gh/dokmic/webpack-redis-plugin?branch=master)

This webpack plugin provides an ability to save your assets in [Redis](https://redis.io/).

## Install
```bash
npm install --save-dev webpack-redis-plugin
```

## Usage
In your `webpack.config.js`:
```javascript
const WebpackRedisPlugin = require('webpack-redis-plugin'),
  sha1 = require('sha1');

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
      filter: (key, asset) => {
        return key === 'js/page1.js' && asset.size();
      },
      transform: (key, asset) => Object({
        key: key + '.sha1',
        value: sha1(asset.source()),
      }),
    }),
  ],
};
```

This config tells the plugin to filter out everything except non-empty `js/page1.js` and save a hash sum of the contents at `js/page1.js.sha1` key.

## API

### `options.config`
Redis client configuration. All possible options can be found [here](https://www.npmjs.com/package/redis#options-object-properties).

### `options.filter`
The callback function filters keys/assets that will be set in Redis:

```javascript
Function(
  key: string,
  asset: {
    size: Function(): number,
    source: Function(): string,
  }
): boolean
```

- `key` - the destination file name relative to your output directory.
- `asset` - related webpack asset.

**Default:** `() => true`

### `options.transform`
The callback function transforms keys and values that will be set in Redis:

```javascript
Function(
  key: string,
  asset: {
    size: Function(): number,
    source: Function(): string,
  }
): { key: string, value: string }
```
- `key` - the destination file name relative to your output directory.
- `asset` - related webpack asset.

**Default:** `(key, asset) => { key, value: asset.source() }`
