const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
  entry: {
   'index': './dist/prostgles-full-cdn.js', //  './lib/prostgles-full-cdn.ts  
   'index.no-sync': './dist/prostgles.js' //    './lib/prostgles.ts'  
  },
  mode: 'production', // "development",// 
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        // use: 'ts-loader',
        loader: 'ts-loader',
        exclude: /node_modules/,
        options: {
          projectReferences: true,
        }
      },
    ],
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ],
    plugins: [
			new TsconfigPathsPlugin(),
		],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'umd',
    globalObject: 'this || window'
  },
};