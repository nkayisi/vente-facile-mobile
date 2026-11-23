/**
 * L'adresse d'une imprimante réseau (Ethernet, Wi-Fi), dans l'écran Imprimante.
 *
 * Le champ vit à part de l'écran, qui est long : il ne porte que la saisie et
 * son refus nommé. La règle de lecture (IPv4 ou nom d'hôte, port 9100 par
 * défaut) est celle de `analyserAdresseReseau`, testée.
 *
 * Monté seulement quand le transport « réseau » est retenu : chaque montage
 * repart de l'adresse enregistrée, sans erreur restée d'une saisie précédente.
 */
import { useState } from "react";

import { adresseReseauRangee, analyserAdresseReseau } from "@/printing";
import { Button, Card, FormField, Input } from "@/ui";

export function CarteAdresseReseau({
  adresse,
  onEnregistrer,
}: {
  /** L'adresse enregistrée (`hote:port`), ou rien. */
  adresse: string | undefined;
  onEnregistrer: (adresse: string) => Promise<void>;
}) {
  const [saisie, setSaisie] = useState(adresse ?? "");
  const [erreur, setErreur] = useState<string | null>(null);

  const enregistrer = async () => {
    const lue = analyserAdresseReseau(saisie);
    if (!lue.ok) {
      setErreur(lue.motif);
      return;
    }
    setErreur(null);
    const rangee = adresseReseauRangee(lue.hote, lue.port);
    setSaisie(rangee);
    await onEnregistrer(rangee);
  };

  return (
    <Card>
      <FormField
        label="Adresse de l'imprimante"
        hint="L'adresse IP que l'imprimante affiche (souvent sur son ticket d'auto-test). Le port 9100 est pris par défaut."
        error={erreur ?? undefined}
        required
      >
        <Input
          value={saisie}
          onChangeText={(t) => {
            setSaisie(t);
            setErreur(null);
          }}
          placeholder="192.168.1.50"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          invalid={erreur !== null}
          onSubmitEditing={() => void enregistrer()}
        />
      </FormField>
      <Button onPress={() => void enregistrer()} fullWidth>
        Enregistrer l&apos;adresse
      </Button>
    </Card>
  );
}
