import { Stack } from "expo-router";

export default function LockedLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
