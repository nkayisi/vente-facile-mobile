import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  // `expo` change la sortie : drizzle-kit produit alors un journal de
  // migrations embarquable dans le bundle, au lieu de fichiers a lire au
  // demarrage. Sans lui, rien ne migre sur l'appareil.
  driver: "expo",
});
