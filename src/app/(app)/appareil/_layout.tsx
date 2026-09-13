import { Stack } from "expo-router";

/**
 * Écrans propres au TERMINAL, et non au commerce.
 *
 * Ils n'ont aucun miroir dans le back-office, c'est pourquoi ils ne sont pas
 * des entrées du menu : ils vivent dans un bloc « Cet appareil » au bas du
 * tiroir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUS NE SONT PAS DANS CE BLOC, ET C'EST VOULU.                          │
 * │                                                                          │
 * │ Le bloc ne porte que les TROIS écrans qu'on vient chercher au comptoir : │
 * │ synchronisation, opérations à corriger, imprimante. Les deux autres      │
 * │ routes vivent encore, atteintes depuis l'endroit où la question se pose  │
 * │ vraiment - `documents` depuis la fiche d'une caisse, `bascule` depuis le │
 * │ bandeau du tableau de bord, qui ne paraît que s'il reste quelque chose.  │
 * │                                                                          │
 * │ « Apparence » a disparu : un écran entier pour UN réglage qu'on change   │
 * │ quand la lumière change. C'est `ui/bascule-theme.tsx`, dans le pied du   │
 * │ tiroir. « Appareils » aussi : lecture pure, aucune action possible d'ici │
 * │ (son propre bandeau disait que la révocation se fait au back-office), et │
 * │ le code de CE terminal - le seul chiffre utile au comptoir, celui des    │
 * │ tickets - est déjà sur l'onglet Profil.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function AppareilLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
