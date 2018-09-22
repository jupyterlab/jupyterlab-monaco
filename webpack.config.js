const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    "editor.worker": 'monaco-editor-core/esm/vs/editor/editor.worker.js'
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'lib'),
    globalObject: 'self'
  },
  module: {
    rules: [{
      test: /\.css$/,
	use: ['style-loader', 'css-loader']
    }]
  },
  plugins: [
    // Ignore require() calls in vs/language/typescript/lib/typescriptServices.js
    new webpack.IgnorePlugin(
      /^((fs)|(path)|(os)|(crypto)|(source-map-support))$/,
      /vs\/language\/typescript\/lib/
    )
  ]
};

