/**
 * Inscription, étape 2 : « Votre établissement ».
 *
 * Miroir de la seconde étape de `app/auth/register/page.tsx` : les six types
 * d'établissement en tuiles, la devise, les conditions.
 *
 * **La devise offre les VINGT ET UNE du noyau**, et elle n'en offrait que deux.
 * Le serveur ne connaissait alors que `CDF|USD` tandis que le sélecteur web en
 * affichait vingt et une : un marchand de Douala qui choisissait le franc CFA
 * lisait « « XAF » n'est pas un choix valide » et ne pouvait pas s'inscrire.
 * La liste vient donc de `SUPPORTED_CURRENCIES`, la même source que le web, et
 * le serveur la valide désormais contre sa table `Currency`.
 *
 * ⚠ Vingt et une entrées ne tiennent pas en tuiles : c'est un `ChampSelect`,
 * comme les quatre de `app/(app)/article/nouveau.tsx`. Sa doctrine réserve
 * `DeclencheurSelect` + `ListeChoix` aux formulaires DÉJÀ en feuille, or cet
 * écran est un `Screen` plein, et son apparence `champ` aligne la hauteur et la
 * bordure sur les deux `Input` au-dessus - ce que deux tuiles ne faisaient pas.
 *
 * **Verrou anti-double-envoi en `useRef`, posé AVANT tout `setState`.** Un
 * `useState` ne se lit pas dans le même tour de boucle ; deux appuis rapprochés
 * créeraient deux boutiques, ce qui est irréparable.
 */
import { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { SUPPORTED_CURRENCIES } from "@vente-facile/core";

import { readableMessage } from "@/api/errors";
import { useSession } from "@/session/provider";
import { EchecInscription, type TypeEtablissement } from "@/session/session";
import {
  Banner,
  Button,
  ChampSelect,
  FormField,
  Input,
  Pressable,
  Screen,
  Stepper,
  Text,
  TuileChoix,
  type IconName,
  type OptionSelect,
} from "@/ui";
import { useInscription } from "./_layout";

/** Les six types, avec les libellés et descriptions exacts de l'assistant web. */
const TYPES: { valeur: TypeEtablissement; titre: string; description: string; icon: IconName }[] = [
  { valeur: "boutique", titre: "Boutique", description: "Magasin de détail, commerce de proximité", icon: "Store" },
  { valeur: "supermarket", titre: "Supermarché", description: "Grande surface, superette", icon: "Building2" },
  { valeur: "pharmacy", titre: "Pharmacie", description: "Pharmacie, parapharmacie", icon: "Pill" },
  { valeur: "depot", titre: "Dépôt", description: "Dépôt de boissons, grossiste", icon: "Package" },
  { valeur: "restaurant", titre: "Restaurant", description: "Restaurant, snack, café", icon: "UtensilsCrossed" },
  { valeur: "other", titre: "Autre", description: "Autre type d'établissement", icon: "MoreHorizontal" },
];

/**
 * Les vingt et une devises du noyau, la même source que le sélecteur web.
 *
 * ⚠ LE CODE EST EN TÊTE DU LIBELLÉ, et le nom ne descend pas en `detail` : c'est
 * par le code qu'un marchand cherche sa monnaie, et c'est aussi ce que le
 * déclencheur replié doit annoncer. Mis en ligne secondaire, le nom laisserait un
 * déclencheur qui ne dit que « XAF ».
 *
 * Construite au niveau module : elle ne dépend d'aucun état, donc la recalculer à
 * chaque rendu serait du travail pour rien.
 */
const DEVISES: OptionSelect[] = SUPPORTED_CURRENCIES.map((d) => ({
  valeur: d.code,
  label: `${d.code} - ${d.name}`,
}));

export default function Etablissement() {
  const { saisie, poser } = useInscription();
  const { chooseOrganization, inscrire } = useSession();
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);
  /** Renseigné quand la boutique EXISTE mais que le terminal n'est pas enrôlé. */
  const [aEnroler, setAEnroler] = useState<string | null>(null);
  const [cgu, setCgu] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const verrou = useRef(false);

  async function creer() {
    if (verrou.current) return;

    const e: Record<string, string> = {};
    if (saisie.organization_name.trim().length < 2)
      e.organization_name = "Le nom de l'établissement est obligatoire";
    // Le serveur exige ce champ NON VIDE : le message le dit plutôt que de
    // laisser l'utilisateur découvrir un 400 après coup.
    if (saisie.organization_phone.trim().length === 0)
      e.organization_phone = "Le téléphone de contact est obligatoire";
    if (!cgu) e.cgu = "Vous devez accepter les conditions";
    setErreurs(e);
    if (Object.keys(e).length > 0) return;

    verrou.current = true;
    setEnvoi(true);
    setErreurGenerale(null);
    try {
      await inscrire(
        {
          first_name: saisie.first_name.trim(),
          last_name: saisie.last_name.trim(),
          email: saisie.email.trim(),
          phone: saisie.phone?.trim() || undefined,
          password: saisie.password,
          password_confirm: saisie.password_confirm,
        },
        {
          organization_name: saisie.organization_name.trim(),
          organization_phone: saisie.organization_phone.trim(),
          business_type: saisie.business_type,
          currency: saisie.currency,
          country: "RDC",
        }
      );
      // La garde de session reprend la main : elle mène au code PIN.
    } catch (error) {
      if (error instanceof EchecInscription && error.etape === "enrolement") {
        // On ne perd RIEN : les jetons sont écrits et la boutique existe. On ne
        // repropose surtout pas de la créer, ce qui en ferait une seconde.
        setAEnroler(error.organizationId ?? null);
      } else {
        const cause = error instanceof EchecInscription ? error.cause : error;
        setErreurGenerale(
          readableMessage(
            (cause as { body?: unknown })?.body,
            "La création n'a pas abouti. Vérifiez vos informations et réessayez."
          )
        );
      }
    } finally {
      verrou.current = false;
      setEnvoi(false);
    }
  }

  /**
   * Reprendre un enrôlement interrompu.
   *
   * ⚠ **ON PASSE PAR LE FOURNISSEUR, JAMAIS PAR `enrollDevice` EN DIRECT.**
   *
   * `chooseOrganization` fait exactement le même appel, plus deux choses qui
   * manquaient ici. D'abord le VERDICT sur la base locale : un instantané écrit
   * sans lui se ferait adopter par les données du compte précédent au prochain
   * démarrage, et les deux établissements fusionneraient - c'est le défaut que
   * `session/proprietaire.ts` existe pour fermer. Ensuite `setStatus` : sans
   * lui l'état restait `anonymous`, la garde renvoyait aussitôt à la connexion,
   * et le marchand ne pouvait PAS reprendre son enrôlement. Le
   * `router.replace("/")` qui se trouvait ici combattait la garde au lieu de la
   * laisser faire ; elle navigue seule dès que le statut bascule.
   */
  async function reprendreEnrolement() {
    if (!aEnroler || verrou.current) return;
    verrou.current = true;
    setEnvoi(true);
    try {
      await chooseOrganization(aEnroler);
    } catch {
      setErreurGenerale("L'enregistrement du terminal n'a pas abouti. Réessayez.");
    } finally {
      verrou.current = false;
      setEnvoi(false);
    }
  }

  if (aEnroler) {
    return (
      <Screen scroll centre>
        <View className="gap-4">
          <Banner
            tone="success"
            title="Votre boutique est créée"
            message="Il reste à enregistrer ce terminal pour pouvoir vendre hors ligne."
          />
          {erreurGenerale ? (
            <Banner tone="destructive" title="Échec" message={erreurGenerale} />
          ) : null}
          <Button fullWidth size="lg" loading={envoi} onPress={() => void reprendreEnrolement()}>
            Enregistrer ce terminal
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll centre>
      <View className="mb-6">
        <Stepper etapes={["Vos informations", "Votre établissement"]} courante={1} />
      </View>

      <View className="gap-4">
        <FormField label="Nom de l'établissement" required error={erreurs.organization_name}>
          <Input
            value={saisie.organization_name}
            onChangeText={(v) => poser({ organization_name: v })}
            placeholder="Ma Boutique"
            invalid={Boolean(erreurs.organization_name)}
          />
        </FormField>

        <FormField label="Téléphone de contact" required error={erreurs.organization_phone}>
          <Input
            value={saisie.organization_phone}
            onChangeText={(v) => poser({ organization_phone: v })}
            placeholder="+243 XXX XXX XXX"
            keyboardType="phone-pad"
            maxLength={20}
            invalid={Boolean(erreurs.organization_phone)}
          />
        </FormField>

        <View>
          <Text variant="label" className="mb-2">
            Type d'établissement <Text className="text-destructive">*</Text>
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {TYPES.map((t) => (
              <TuileChoix
                key={t.valeur}
                titre={t.titre}
                description={t.description}
                icon={t.icon}
                choisie={saisie.business_type === t.valeur}
                onPress={() => poser({ business_type: t.valeur })}
              />
            ))}
          </View>
        </View>

        {/* L'avertissement est SOUS le champ, comme sur le web : c'est une
            décision irréversible, elle ne se cache pas dans une info-bulle.
            `FormField` le porte en `hint`, comme les champs voisins, plutôt
            qu'un `Text variant="caption"` posé à la main. */}
        <FormField
          label="Devise par défaut"
          required
          hint="Cette devise sera utilisée par défaut dans votre établissement et ne pourra plus être modifiée après la création."
        >
          <ChampSelect
            valeur={saisie.currency}
            onChange={(v) => {
              // ⚠ Pas de `libelleVide` : le champ est obligatoire et toujours
              // renseigné (`_layout.tsx` l'initialise à CDF), donc la liste
              // n'offre aucune entrée « aucun choix » et `v` ne peut pas être
              // nul. On garde la valeur courante plutôt que d'en inventer une.
              if (v) poser({ currency: v });
            }}
            options={DEVISES}
            titre="Devise par défaut"
            accessibilityLabel="Devise par défaut"
          />
        </FormField>

        <Pressable
          onPress={() => setCgu((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: cgu }}
          accessibilityLabel="J'accepte les conditions d'utilisation"
          className="flex-row items-center gap-3 py-2"
        >
          <View
            className={`h-6 w-6 items-center justify-center rounded border-2 ${
              cgu ? "border-primary bg-primary" : "border-border"
            }`}
          >
            {cgu ? <Text className="text-xs text-primary-foreground">✓</Text> : null}
          </View>
          <Text variant="bodySmall" className="flex-1">
            J'accepte les conditions d'utilisation et la politique de confidentialité
          </Text>
        </Pressable>
        {erreurs.cgu ? <Text variant="error">{erreurs.cgu}</Text> : null}

        {erreurGenerale ? (
          <Banner tone="destructive" title="La création n'a pas abouti" message={erreurGenerale} />
        ) : null}
      </View>

      <View className="mt-6 flex-row gap-3">
        <View className="flex-1">
          <Button variant="outline" fullWidth leftIcon="ArrowLeft" onPress={() => router.back()}>
            Retour
          </Button>
        </View>
        <View className="flex-1">
          <Button fullWidth leftIcon="Check" loading={envoi} onPress={() => void creer()}>
            Créer ma boutique
          </Button>
        </View>
      </View>
    </Screen>
  );
}
