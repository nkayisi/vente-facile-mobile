/**
 * Paramètres, Infos générales. Miroir de `app/dashboard/settings/page.tsx`.
 *
 * **LA LECTURE EST HORS LIGNE, L'ÉCRITURE EST EN LIGNE.** Les valeurs viennent
 * des tables tirées (`organizations`, `organization_settings`), donc l'écran
 * s'affiche complet sans réseau, démarrage à froid compris. Mais aucun `kind`
 * de paramètres n'existe côté serveur - les neuf gestionnaires de poussée sont
 * des actes métier - donc on ne peut pas mettre une modification en file. Le
 * dire est plus honnête que le simuler : un réglage qu'on croirait enregistré
 * et qui ne partirait jamais est pire qu'un bouton grisé.
 *
 * Trois gardes, dans cet ordre de priorité :
 *   1. hors ligne      -> bandeau, champs verrouillés, bouton désactivé
 *   2. droits          -> bandeau ambre, comme le web
 *   3. en ligne + rôle -> édition
 *
 * Après un enregistrement réussi : un TIRAGE CIBLÉ, jamais une écriture locale
 * depuis la réponse. Le serveur fait autorité sans exception.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { isAtLeastRole } from "@vente-facile/core";

import { api } from "@/api/client";
import { readableMessage } from "@/api/errors";
import { useLecture } from "@/data/live";
import { etablissement, parametresRecu } from "@/data/organisation";
import { tirerTables } from "@/data/rafraichir";
import { useEnLigne } from "@/data/reseau";
import { useSession } from "@/session/provider";
import {
  Banner,
  Button,
  Card,
  CardHeader,
  FormField,
  Input,
  ListItem,
  Screen,
  Section,
  Spinner,
  Switch,
  Text,
  TuileChoix,
  useToast,
} from "@/ui";

const TABLES = ["organizations", "organization_settings"];

export default function InfosGenerales() {
  const { snapshot } = useSession();
  const enLigne = useEnLigne();
  const toast = useToast();

  const { donnees: etab, chargement } = useLecture(etablissement, { tables: TABLES });
  const { donnees: recu } = useLecture(parametresRecu, { tables: TABLES });

  const [form, setForm] = useState({
    nom: "", telephone: "", email: "", adresse: "", ville: "", pays: "",
    nif: "", rccm: "", idNat: "",
  });
  const [reglages, setReglages] = useState({
    enTete: "", pied: "", largeurPapier: 58, seuil: "", points: false,
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // On ne repose le formulaire que lorsque la source change : autrement une
  // frappe serait écrasée par le rendu suivant.
  useEffect(() => {
    if (!etab) return;
    setForm({
      nom: etab.nom, telephone: etab.telephone ?? "", email: etab.email ?? "",
      adresse: etab.adresse ?? "", ville: etab.ville ?? "", pays: etab.pays ?? "",
      nif: etab.nif ?? "", rccm: etab.rccm ?? "", idNat: etab.idNat ?? "",
    });
  }, [etab?.id, etab?.nom, etab?.telephone, etab?.email, etab?.adresse, etab?.ville, etab?.pays, etab?.nif, etab?.rccm, etab?.idNat]);

  useEffect(() => {
    if (!recu) return;
    setReglages({
      enTete: recu.enTete ?? "", pied: recu.pied ?? "",
      largeurPapier: recu.largeurPapier, points: recu.pointsSurRecu,
      seuil: recu.seuilStockBas != null ? String(recu.seuilStockBas) : "",
    });
  }, [recu?.enTete, recu?.pied, recu?.largeurPapier, recu?.pointsSurRecu, recu?.seuilStockBas]);

  const droits = isAtLeastRole(
    snapshot?.membership
      ? {
          role: snapshot.membership.role ?? "cashier",
          role_display: "",
          permissions: snapshot.membership.permissions,
          // `manageable_roles` ne sert qu'a l'ecran d'administration des membres,
          // qui n'existe pas encore ici : `isAtLeastRole` ne lit que `role`.
          manageable_roles: [],
        }
      : null,
    "manager"
  );
  const modifiable = enLigne && droits;

  async function enregistrer() {
    if (!etab || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.patch(`/organizations/${etab.id}/`, {
        name: form.nom.trim(),
        phone: form.telephone.trim(),
        email: form.email.trim(),
        address: form.adresse.trim(),
        city: form.ville.trim(),
        country: form.pays.trim(),
        tax_id: form.nif.trim(),
        rccm: form.rccm.trim(),
        id_nat: form.idNat.trim(),
      });
      await api.post("/settings/organization-settings/", {
        receipt_header: reglages.enTete,
        receipt_footer: reglages.pied,
        receipt_paper_width: reglages.largeurPapier,
        show_loyalty_points_on_receipt: reglages.points,
        low_stock_threshold: reglages.seuil === "" ? null : Number(reglages.seuil),
      });
      // Tirage ciblé : la vue se met à jour depuis le SERVEUR, jamais depuis
      // ce qu'on vient d'envoyer.
      await tirerTables(TABLES);
      toast.succes("Paramètres enregistrés");
    } catch (e) {
      setErreur(
        readableMessage((e as { body?: unknown })?.body, "L'enregistrement n'a pas abouti.")
      );
    } finally {
      setEnvoi(false);
    }
  }

  if (chargement && !etab) {
    return (
      <View className="py-16">
        <Spinner size="large" />
      </View>
    );
  }

  return (
    <View className="gap-6 p-4">
      {!enLigne ? (
        <Banner
          tone="warning"
          title="Hors ligne"
          message="Les paramètres se consultent, mais se modifient en ligne : le serveur doit les appliquer avant que vos autres terminaux les reçoivent."
        />
      ) : !droits ? (
        <Banner
          tone="warning"
          title="Lecture seule"
          message="Seuls les gérants et les administrateurs peuvent modifier ces informations."
        />
      ) : null}

      {erreur ? <Banner tone="destructive" title="Échec" message={erreur} /> : null}

      <Section title="Informations de l'établissement">
        <Card className="gap-4">
          <FormField label="Nom de l'établissement" required>
            <Input value={form.nom} onChangeText={(v) => setForm((f) => ({ ...f, nom: v }))}
                   editable={modifiable} placeholder="Ex : Boutique Chez Nelson" />
          </FormField>

          {/* Non modifiable après la création, comme sur le web. */}
          <ListItem title="Type d'activité" value={etab?.typeAffiche ?? "—"}
                    subtitle="Non modifiable après la création" />

          <FormField label="Téléphone" required>
            <Input value={form.telephone} onChangeText={(v) => setForm((f) => ({ ...f, telephone: v }))}
                   editable={modifiable} keyboardType="phone-pad" placeholder="Ex : +243 800 000 000" />
          </FormField>
          <FormField label="Email">
            <Input value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                   editable={modifiable} keyboardType="email-address" autoCapitalize="none" />
          </FormField>
          <FormField label="Adresse">
            <Input value={form.adresse} onChangeText={(v) => setForm((f) => ({ ...f, adresse: v }))}
                   editable={modifiable} multiline numberOfLines={2}
                   style={{ minHeight: 72, textAlignVertical: "top" }} />
          </FormField>
          <FormField label="Ville">
            <Input value={form.ville} onChangeText={(v) => setForm((f) => ({ ...f, ville: v }))}
                   editable={modifiable} placeholder="Ex : Kinshasa" />
          </FormField>
          <FormField label="Pays">
            <Input value={form.pays} onChangeText={(v) => setForm((f) => ({ ...f, pays: v }))}
                   editable={modifiable} />
          </FormField>
          <FormField label="N° impôt (NIF)">
            <Input value={form.nif} onChangeText={(v) => setForm((f) => ({ ...f, nif: v }))}
                   editable={modifiable} />
          </FormField>
          <FormField label="RCCM">
            <Input value={form.rccm} onChangeText={(v) => setForm((f) => ({ ...f, rccm: v }))}
                   editable={modifiable} />
          </FormField>
          <FormField label="ID National">
            <Input value={form.idNat} onChangeText={(v) => setForm((f) => ({ ...f, idNat: v }))}
                   editable={modifiable} />
          </FormField>
        </Card>
      </Section>

      <Section title="Paramètres généraux">
        <Card className="gap-4">
          <CardHeader title="Reçus" subtitle="Ce qui s'imprime en tête et en pied de ticket" />
          <FormField label="En-tête du reçu">
            <Input value={reglages.enTete} onChangeText={(v) => setReglages((r) => ({ ...r, enTete: v }))}
                   editable={modifiable} multiline numberOfLines={3}
                   style={{ minHeight: 88, textAlignVertical: "top" }} />
          </FormField>
          <FormField label="Pied de page du reçu">
            <Input value={reglages.pied} onChangeText={(v) => setReglages((r) => ({ ...r, pied: v }))}
                   editable={modifiable} multiline numberOfLines={3}
                   style={{ minHeight: 88, textAlignVertical: "top" }} />
          </FormField>
          {/*
            ⚠ CE RÉGLAGE N'EST PAS CELUI DE L'IMPRIMANTE DE CE TERMINAL.

            Il voyage jusqu'au serveur (`receipt_paper_width`) et sert les reçus
            que le back-office produit. L'imprimante du comptoir, elle, lit son
            propre réglage local (Appareil → Imprimante), parce qu'une largeur
            décrit un ROULEAU, donc une machine, et que deux comptoirs d'une
            même boutique peuvent avoir deux imprimantes.

            Le dire est indispensable : les deux réglages voisins de cette même
            carte - en-tête et pied - arrivent bien sur le papier du comptoir.
            Le marchand les règle ensemble, voit l'en-tête sortir, et en conclut
            que la largeur est prise en compte. Elle ne l'est pas.
          */}
          <View>
            <Text variant="label" className="mb-2">Largeur du papier au back-office</Text>
            <Text variant="caption" className="mb-2 text-muted-foreground">
              Pour les reçus imprimés depuis un ordinateur. L&apos;imprimante de ce
              terminal a sa propre largeur, dans Appareil → Imprimante.
            </Text>
            <View className="flex-row gap-3">
              <TuileChoix titre="58 mm" description="Ticket étroit"
                          choisie={reglages.largeurPapier === 58}
                          onPress={() => modifiable && setReglages((r) => ({ ...r, largeurPapier: 58 }))} />
              <TuileChoix titre="80 mm" description="Ticket standard"
                          choisie={reglages.largeurPapier === 80}
                          onPress={() => modifiable && setReglages((r) => ({ ...r, largeurPapier: 80 }))} />
            </View>
          </View>
        </Card>

        <Card className="mt-3 gap-4">
          <CardHeader title="Notifications" />
          <FormField label="Seuil d'alerte stock bas">
            <Input value={reglages.seuil} onChangeText={(v) => setReglages((r) => ({ ...r, seuil: v }))}
                   editable={modifiable} keyboardType="number-pad" />
          </FormField>
        </Card>

        <Card className="mt-3">
          <CardHeader title="Affichage sur les reçus" />
          <Switch
            label="Afficher les points de fidélité sur les reçus"
            valeur={reglages.points}
            desactive={!modifiable}
            onChange={(v) => setReglages((r) => ({ ...r, points: v }))}
          />
        </Card>
      </Section>

      <Button fullWidth size="lg" leftIcon="Save" loading={envoi}
              disabled={!modifiable}
              onPress={() => void enregistrer()}>
        Enregistrer
      </Button>
      {!modifiable ? (
        <Text variant="caption" className="-mt-4 text-center">
          {enLigne
            ? "Réservé aux gérants et aux administrateurs."
            : "Reconnectez-vous à Internet pour enregistrer."}
        </Text>
      ) : null}
    </View>
  );
}
