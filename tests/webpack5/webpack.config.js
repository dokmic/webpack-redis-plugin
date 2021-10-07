const { WebpackRedisPlugin } = require('webpack-redis-plugin');

module.exports = {
  mode: 'development',
  entry: '../index.js',
  plugins: [
    new WebpackRedisPlugin({
      transform: (key, asset) => ({
        key: 'webpack-redis-plugin',
        value: asset.source(),
      }),
    }),
  ],
};
