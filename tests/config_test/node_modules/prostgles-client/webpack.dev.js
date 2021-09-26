
const path = require('path');

module.exports = {
  entry: './lib/prostgles-full.ts',
  devtool: 'inline-source-map',
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ],
  },
  output: {
    filename: 'prostgles.dev.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    globalObject: 'this',
  },
  watch: true,
  watchOptions:  {
    aggregateTimeout: 200,
    poll: 1000
  }
};