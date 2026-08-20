module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-worklets/plugin habilita worklets para react-native-reanimated
    // (requerido por react-native-keyboard-controller). Debe ir SIEMPRE al final.
    plugins: ["react-native-worklets/plugin"],
  };
};
