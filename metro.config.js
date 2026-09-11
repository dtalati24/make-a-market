const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build ships a .wasm file.
config.resolver.assetExts.push('wasm');

// expo-sqlite on web needs SharedArrayBuffer, which browsers only enable on
// cross-origin isolated pages. Only affects the dev server, not the Android app.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};

module.exports = config;
