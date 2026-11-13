/**
 * Point d'entrée du paquet JavaScript.
 *
 * ⚠ L'ORDRE EST LA RAISON D'ÊTRE DE CE FICHIER. La tâche de poussée en
 *   arrière-plan doit être DÉFINIE dans la portée globale, avant l'application :
 *   quand le système réveille l'application pour elle, il n'y a ni écran ni
 *   routeur, rien que ce qui s'exécute au chargement. Voir
 *   `src/sync/arriere-plan.ts`.
 */
import "./src/sync/arriere-plan";
import "expo-router/entry";
