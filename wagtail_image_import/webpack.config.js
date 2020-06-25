

const path = require('path');

module.exports = {
    entry: "./static_src/wagtail_image_import/js/importer.js",
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader"
          }
        }
      ]
    },
    output: {
        path: path.resolve(__dirname, 'static/wagtail_image_import/js/'),
        filename: 'importer.js',
    }
  };