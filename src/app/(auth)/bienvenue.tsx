/**
 * La présentation, vue au tout premier lancement.
 *
 * Quatre vues balayables qui montrent les huit modules du produit, deux par
 * deux, puis la connexion. Elle ne paraît qu'une fois : `SessionGate` n'y
 * envoie que lorsque le drapeau `accueil.vu` est absent.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL Y A DEUX SORTIES, ET ELLES PASSENT PAR LA MÊME FONCTION.             │
 * │                                                                          │
 * │ « Passer » et « Commencer » mènent au même endroit et doivent écrire le  │
 * │ même drapeau. (« Revoir », sur la dernière vue, ne sort pas : elle       │
 * │ ramène au début.)                                                        │
 * │ Un second chemin vers la connexion laisserait le drapeau                 │
 * │ non écrit, et la présentation reviendrait à CHAQUE lancement sans que    │
 * │ rien ne le signale - l'écran s'affiche, il est simplement de trop. Un    │
 * │ garde-fou de doctrine refuse toute navigation vers la connexion qui ne   │
 * │ passe pas par `terminer`.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ LE `Screen` N'EST PAS `centre`, et c'est une exception NOMMÉE dans
 * `ui/doctrine.test.ts`. Le garde-fou du parcours d'authentification vise les
 * FORMULAIRES, dont le contenu est la page entière ; ici le corps est un pager
 * pleine hauteur, et le centrer l'empêcherait de remplir la fenêtre, donc de
 * paginer sur une page entière. C'est chaque VUE qui empile sa maquette et son
 * texte sur toute la hauteur.
 *
 * ⚠ L'EXCEPTION EST LE SEUL VERROU. Sa note affirmait que le garde-fou
 * passerait de toute façon, les vues portant un `justify-center` ; c'était
 * faux depuis toujours, `centreAutrement` lisant CE fichier-ci et non
 * `carrousel.tsx`, qui vit dans `features/` et n'est pas balayé. La retirer
 * fait réellement échouer la suite.
 */
import { useCallback } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useSession } from "@/session/provider";
import { Apparition, Logo, Screen } from "@/ui";
import {
  ActionEntete,
  PagesCarrousel,
  PiedCarrousel,
  useCarrousel,
} from "@/features/accueil/carrousel";

export default function Bienvenue() {
  const { marquerAccueilVu } = useSession();
  const c = useCarrousel();

  const terminer = useCallback(() => {
    // ⚠ ON N'ATTEND PAS L'ÉCRITURE. Elle prend quelques millisecondes sur
    // SQLite, et les faire payer au marchand sur un appui de sortie se
    // sentirait. Le pire qu'un arrêt brutal entre les deux puisse coûter est
    // une présentation revue une fois.
    void marquerAccueilVu();
    router.replace("/(auth)/login");
  }, [marquerAccueilVu]);

  return (
    <Screen
      padded={false}
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ D'UN SEUL TENANT, CORPS ET PIED.                                │
      // │                                                                  │
      // │ Le pied etait blanc (`bg-card`) sur un corps gris               │
      // │ (`bg-background`) : une couture en travers de l'ecran, relevee   │
      // │ capture a l'appui. La presentation est la seule page dont le     │
      // │ contenu EST la page ; elle n'a rien a detacher.                  │
      // │                                                                  │
      // │ ⚠ Cela ne repeint QUE cet ecran. Les ~20 autres qui portent un   │
      // │ pied gardent leur blanc sur gris, ou le filet separe bien un     │
      // │ contenu qui defile dessous.                                      │
      // └──────────────────────────────────────────────────────────────────┘
      fond="card"
      /* ⚠ UN COMMENTAIRE JSX (`{/* … *\/}`) EST INVALIDE DANS UNE VALEUR
         D'ATTRIBUT : `pied={…}` attend une expression, pas des enfants. Écrit
         ainsi, il fait échouer la compilation - et la suite de tests, elle,
         reste verte, parce qu'elle ne compile pas cet écran.

         Rang 3 : la cascade est barre du haut, pile, texte, pied. Le pied
         entre en dernier parce qu'il est ce qu'on regarde en dernier. */
      pied={
        <Apparition index={3}>
          <PiedCarrousel c={c} onTerminer={terminer} />
        </Apparition>
      }
    >
      <Apparition index={0}>
        {/* ⚠ `px-6`, COMME LE BLOC DE TEXTE ET COMME LE PIED. Cette barre
            était à `px-4` : le logo tombait huit points à gauche du titre, et
            un bord gauche en escalier est le genre de défaut qui se voit sans
            qu'on sache le nommer. C'est la même correction qu'a demandée le
            bord gauche des documents imprimés. */}
        <View className="flex-row items-center justify-between px-6 py-2">
          <Logo hauteur={44} />
          <ActionEntete c={c} onTerminer={terminer} />
        </View>
      </Apparition>

      {/* `flex-1` ici et non sur une `Apparition` : celle-ci rend une vue sans
          flex, et l'y envelopper réduirait le pager à zéro pixel de haut.
          L'entrée des vues se joue DANS chaque page, aux rangs 1 et 2. */}
      <View className="flex-1">
        <PagesCarrousel c={c} />
      </View>
    </Screen>
  );
}
