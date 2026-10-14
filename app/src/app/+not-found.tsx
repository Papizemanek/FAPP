import { Redirect } from 'expo-router';

// Neznámý odkaz (starý deep link, notifikace) vede na začátek, ne na chybovou stránku.
export default function NotFound() {
  return <Redirect href="/" />;
}
