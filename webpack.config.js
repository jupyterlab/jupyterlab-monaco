const webpack = require('webpack');

module.exports = {
  entry: {
    "editor.worker": 'monaco-editor-core/esm/vs/editor/common/services/editorSimpleWorker.js',
    "index.ts": './lib/index.js'
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

