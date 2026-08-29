import { Stack } from "expo-router";

/**
 * Écrans propres au TERMINAL, et non au commerce : synchronisation, opérations
 * à corriger, imprimante, apparence.
 *
 * Ils n'ont aucun miroir dans le back-office, c'est pourquoi ils ne sont pas
 * des entrées du menu : ils vivent dans un bloc « Cet appareil » au bas de
 * l'écran « Plus ».
 */
export default function AppareilLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
