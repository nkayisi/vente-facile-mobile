module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Les migrations Drizzle sont des fichiers .sql : ce greffon les inline
      // dans le bundle, il n'y a pas de systeme de fichiers a lire au demarrage.
      ["inline-import", { extensions: [".sql"] }],
    ],
  };
};
