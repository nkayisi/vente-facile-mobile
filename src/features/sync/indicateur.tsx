/**
 * Le témoin de synchronisation, dans la barre du haut.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL EST TOUJOURS VISIBLE, MÊME QUAND TOUT VA BIEN.                       │
 * │                                                                          │
 * │ La tentation est de ne l'afficher que lorsqu'il y a quelque chose à      │
 * │ dire. Ce serait perdre deux choses : le marchand n'apprendrait jamais    │
 * │ où regarder, et il perdrait le seul chemin PERMANENT vers une            │
 * │ synchronisation manuelle depuis les cinq onglets. Un bouton qui          │
 * │ disparaît quand tout va bien est un bouton qu'on ne retrouve plus quand  │
 * │ il le faut.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Il vit dans `features/sync/` et non dans `src/ui/` : `useSynchronisation`
 * tire `@/sync` → `@/db/client`, qui ouvre SQLite au chargement du module.
 * Même motif qu'en tête de `bandeau-envoi.tsx`.
 *
 * Le gabarit est celui de `ui/bascule-theme.tsx`, son voisin immédiat dans la
 * barre : appui pour l'acte courant, pression longue pour les détails.
 */
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";

import { ilYA } from "@/data/dates";
import { useLecture } from "@/data/live";
import { useEnLigne } from "@/data/reseau";
import { countByState, type OutboxState } from "@/sync";
import {
  Button,
  Divider,
  Icon,
  Pressable,
  Sheet,
  Text,
  useMouvementReduit,
  useTheme,
  type ColorToken,
} from "@/ui";
import { HIT } from "@/ui/tokens";

import { etatIndicateur, type CouleurIndicateur } from "./indicateur-etat";
import { useSynchronisation } from "./provider";

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA ROTATION SE PROLONGE APRÈS LE CYCLE, ET CE N'EST PAS COSMÉTIQUE.     │
 * │                                                                          │
 * │ Un cycle d'ENVOI aboutit souvent en deux ou trois cents millisecondes.   │
 * │ La rotation apparaîtrait et disparaîtrait plus vite que l'oeil ne la     │
 * │ lit : elle se percevrait comme un défaut d'affichage, pas comme un       │
 * │ travail. C'est une règle de RENDU, elle ne descend donc pas dans le      │
 * │ module pur, qui ne connaît pas le temps qui passe.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const PROLONGATION_MS = 600;
const TOUR_MS = 900;

const VIDE: Record<OutboxState, number> = {
  pending: 0,
  inflight: 0,
  done: 0,
  quarantined: 0,
  blocked: 0,
};

/** Sur quoi s'écrit le décompte, pour que la pastille reste lisible. */
const TEXTE_SUR: Record<CouleurIndicateur, ColorToken> = {
  primary: "primaryForeground",
  destructive: "destructiveForeground",
  warning: "warningForeground",
  mutedForeground: "card",
};

export function IndicateurSync() {
  const { enCours, derniereSync, lancer } = useSynchronisation();
  const enLigne = useEnLigne();
  const { donnees } = useLecture(countByState, { tables: ["outbox_operations"] });
  const compteurs = donnees ?? VIDE;

  const [feuille, setFeuille] = useState(false);
  const reduit = useMouvementReduit();
  const { colors } = useTheme();

  // ⚠ Les deux bascules passent par un MINUTEUR, y compris celle qui arme le
  // maintien avec un délai nul. Un `setState` synchrone dans le corps d'un
  // effet déclenche un rendu en cascade, et `react-hooks/set-state-in-effect`
  // le refuse : ce n'est pas un caprice de règle, c'est un rendu de plus à
  // chaque battement d'un cycle.
  const [tenu, setTenu] = useState(false);
  useEffect(() => {
    if (enCours) {
      const arme = setTimeout(() => setTenu(true), 0);
      return () => clearTimeout(arme);
    }
    if (!tenu) return;
    const relache = setTimeout(() => setTenu(false), PROLONGATION_MS);
    return () => clearTimeout(relache);
  }, [enCours, tenu]);

  const visible = enCours || tenu;

  const etat = etatIndicateur({ cycleEnCours: visible, enLigne, compteurs });

  // Même motif qu'`Apparition` : une `Animated.Value` est LUE au rendu, et un
  // `ref` lu au rendu est ce que `react-hooks/refs` interdit.
  const [rotation] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!etat.anime || reduit) {
      rotation.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: TOUR_MS,
        // `linear` : une rotation qui accélère puis ralentit se lit comme une
        // progression, or on ne sait justement pas où l'on en est.
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [etat.anime, reduit, rotation]);

  const refuse = compteurs.quarantined > 0;

  return (
    <>
      <Pressable
        onPress={() => void lancer("indicateur")}
        // La pression longue est un RACCOURCI vers le détail, jamais le seul
        // chemin : l'écran Synchronisation reste dans le tiroir.
        onLongPress={() => setFeuille(true)}
        accessibilityRole="button"
        accessibilityLabel={etat.libelle}
        accessibilityHint={etat.hint}
        // ┌──────────────────────────────────────────────────────────────────┐
        // │ AUCUN DÉBORDEMENT DE CIBLE.                                      │
        // │                                                                  │
        // │ `Pressable` étend sa zone de 8 points par défaut. Trois boîtes   │
        // │ de 44 points qui se touchent verraient leurs zones se recouvrir  │
        // │ sur 16 points, et un doigt tombé dans la couture changerait le   │
        // │ thème au lieu de synchroniser. La boîte fait DÉJÀ la cible du    │
        // │ produit : il n'y a rien à étendre. Voir `ui/top-bar.tsx`.        │
        // └──────────────────────────────────────────────────────────────────┘
        hitSlop={0}
        className="items-center justify-center rounded-lg"
        style={{ width: HIT.min, height: HIT.min }}
      >
        <Animated.View
          style={
            etat.anime
              ? {
                  transform: [
                    {
                      rotate: rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0deg", "360deg"],
                      }),
                    },
                  ],
                }
              : undefined
          }
        >
          <Icon name={etat.icone} size={20} color={etat.couleur} />
        </Animated.View>

        {etat.badge ? (
          <View
            // Le décompte est une PASTILLE DE COIN, la grammaire d'un badge
            // d'onglet : « il y a n choses ici », et non « la valeur du relevé
            // est n ». Masquée au lecteur d'écran, l'étiquette du bouton le
            // dit déjà en toutes lettres.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: "absolute",
              top: 2,
              right: 0,
              minWidth: 16,
              height: 16,
              paddingHorizontal: 4,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors[etat.couleur],
            }}
          >
            <Text variant="caption" numeric style={{ color: colors[TEXTE_SUR[etat.couleur]] }}>
              {etat.badge}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Sheet ouvert={feuille} onFermer={() => setFeuille(false)} titre="Synchronisation">
        <View className="gap-4 pb-2">
          <View className="gap-1">
            <Text variant="body">{etat.libelle}</Text>
            <Text variant="caption">{`Dernier tirage complet : ${ilYA(derniereSync)}.`}</Text>
          </View>

          <View className="overflow-hidden rounded-xl border border-border">
            <Ligne
              libelle="Attendent leur envoi"
              valeur={compteurs.pending + compteurs.inflight}
            />
            <Divider inset />
            <Ligne libelle="En attente d'un droit" valeur={compteurs.blocked} />
            <Divider inset />
            <Ligne libelle="Refusées par le serveur" valeur={compteurs.quarantined} />
          </View>

          <View className="gap-2">
            <Button
              fullWidth
              leftIcon="RefreshCw"
              loading={enCours}
              onPress={() => {
                setFeuille(false);
                void lancer("indicateur");
              }}
            >
              {enCours ? "Synchronisation en cours" : "Synchroniser maintenant"}
            </Button>

            {/* Une quarantaine doit MENER quelque part : elle ne repartira
                jamais d'elle-même, et l'ignorer laisse une vente au bord de la
                route. */}
            {refuse ? (
              <Button
                fullWidth
                variant="outline"
                leftIcon="AlertTriangle"
                onPress={() => {
                  setFeuille(false);
                  router.push("/(app)/appareil/operations");
                }}
              >
                Voir et corriger
              </Button>
            ) : null}
          </View>
        </View>
      </Sheet>
    </>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <Text variant="bodySmall">{libelle}</Text>
      <Text variant="bodySmall" numeric>
        {String(valeur)}
      </Text>
    </View>
  );
}
