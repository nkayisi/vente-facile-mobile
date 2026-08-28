/// <reference types="nativewind/types" />

/**
 * `import "./global.css"` est un import pour effet de bord : Metro le
 * transforme, TypeScript ne sait pas quoi en faire sans cette déclaration.
 */
declare module "*.css";
