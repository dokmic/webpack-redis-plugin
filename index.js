const redis = require('redis');

/**
 * Webpack Redis Plugin
 */
class WebpackRedisPlugin {
  /**
   * Initilize new plugin instance
   *
   * @param {Object} options
   */
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * @return {RedisClient}
   */
  getClient() {
    return this._client
      || (this._client = redis.createClient(this.options.config));
  }

  /**
   * Set key contents
   *
   * @param {string} key
   * @param {string} value
   * @return {Promise}
   */
  save({ key, value }) {
    const client = this.getClient();

    return new Promise((resolve, reject) => {
      client.addListener('error', reject);
      client.set(key, value, () => {
        client.removeListener('error', reject);
        resolve();
      });
    });
  }

  /**
   * @param {Compilation} compilation
   * @return {Array<Object>}
   */
  getAssets(compilation) {
    return Object.keys(compilation.assets)
      .filter(key => !this.options.filter
        || this.options.filter(key, compilation.assets[key]))
      .map(key => this.options.transform
        ? this.options.transform(key, compilation.assets[key])
        : { key, value: compilation.assets[key].source() }
      );
  }

  /**
   * @param {Compilation} compilation
   * @param {Function} callback
   * @return {void}
   */
  afterEmit(compilation, callback) {
    if (compilation.errors.length) {
      return callback && callback();
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
    .then(() => callback && callback());
  }

  /**
   * Apply plugin
   *
   * @param {Object} compiler
   */
  apply(compiler) {
    if (compiler.hooks) {
      compiler.hooks.afterEmit.tap({
        name: 'RedisPlugin',
        stage: Infinity
      }, this.afterEmit.bind(this));
    } else {
      compiler.plugin('after-emit', this.afterEmit.bind(this));
    }
  }
}

module.exports = WebpackRedisPlugin;
