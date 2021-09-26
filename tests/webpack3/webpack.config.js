const { WebpackRedisPlugin } = require('webpack-redis-plugin');

module.exports = {
  entry: '../index.js',
  output: {
    filename: 'dist/[name].js',
  },
  plugins: [
    new WebpackRedisPlugin({
      transform: (key, asset) => ({
        key: 'webpack-redis-plugin',
        value: asset.source(),
      }),
    }),
  ],
};
