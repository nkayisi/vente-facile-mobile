# Notes de version, `vf-marchand`

Ce qu'on colle dans le champ **« Nouveautés »** de Google Play Console, à chaque
publication, et ce qu'on envoie aux marchands.

> ⚠ **CONTRAINTES DE PLAY, À NE PAS DÉCOUVRIR À L'ENVOI**
>
> - **500 caractères maximum**, par langue. Au-delà, Play refuse le champ.
> - **Une note par langue déclarée sur la fiche.** Une langue sans note affiche
>   celle de la langue par défaut.
> - Texte brut : les retours à la ligne et les puces `•` passent, le gras et les
>   liens non.
> - ⚠ **Pas de prix, pas de promotion, pas de superlatif** : Play refuse les
>   notes qui ressemblent à une publicité, et une mention de prix périme.
>
> La longueur de chaque note est mesurée ci-dessous. Toute modification se
> remesure avant l'envoi, et c'est une limite de CARACTÈRES, pas d'octets : les
> accents comptent pour un.

> ⚠ **CE QU'ON N'ÉCRIT PAS, ET POURQUOI**
>
> - **Aucune durée d'essai.** Elle est réglable en base (`GlobalConfig.trial_days`)
>   et une note publiée, elle, ne se corrige pas sans republier. Relevé le
>   2026-10-21 : la base dit 15 jours et le site en annonce 14.
> - **Les rapports ne sont jamais présentés comme fonctionnant hors ligne.** Ils
>   exigent le réseau, délibérément : leurs agrégats viennent du serveur, et les
>   recalculer sur le terminal donnerait deux chiffres pour le même
>   établissement. La promesse « sans réseau » porte sur la VENTE et sur
>   l'impression du ticket, jamais sur l'analyse.
> - **Aucune marque d'imprimante.** Le parc est hétérogène, et nommer un modèle
>   ferait conclure à l'incompatibilité de tous les autres.

---

## 1.0.0 (`versionCode` 1) · première publication

### Français (`fr-FR`) · 435 caractères

```
Première version de Vente Facile.

Votre caisse, votre stock et le crédit de vos clients, sur un seul terminal.

• Vendez même sans réseau : le ticket s'imprime, et la vente part dès que la connexion revient
• Francs et dollars, jamais additionnés
• Comptez en casiers et en bouteilles, pas en unités
• Crédit client, échéances et créances à relancer
• Stock, inventaire, dépenses et rapports
• Imprimante du terminal, Bluetooth ou PDF
```

### Anglais (`en-US`) · 416 caractères

À ne remplir **que si** la fiche déclare `en-US`. Le marché visé est la RDC, donc
le français est la langue de référence.

```
First release of Vente Facile.

Your till, your stock and your customers' credit, on a single device.

• Sell with no network: the receipt prints, and the sale syncs once you are back online
• Congolese francs and US dollars, never added together
• Count in crates and bottles, not in units
• Customer credit, due dates and receivables
• Stock, stocktaking, expenses and reports
• Built-in, Bluetooth or PDF printing
```

### Version longue

Pour un message aux marchands, ou la page de nouveautés du site. **Ne va pas dans
Play** : hors limite, et Play refuse ce registre.

```
Vente Facile est maintenant sur Google Play.

Tenez votre commerce, même sans réseau.

LA CAISSE
Vendez au comptoir, encaissez en espèces, en mobile money ou à crédit, et imprimez
le ticket sur place. Le terminal n'attend pas la connexion : la vente est
enregistrée tout de suite, elle part au serveur dès que le réseau revient. Le
numéro du ticket est définitif dès l'impression, donc un client qui revient avec
son papier peut toujours prouver son paiement.

LE GROS ET LE DÉTAIL
Un rayon qui porte 3 casiers scellés et 7 bouteilles isolées s'affiche comme tel,
et jamais comme un total d'unités. Vendez au casier ou à la bouteille, ouvrez un
contenant quand il le faut, et le stock suit.

LES FRANCS ET LES DOLLARS
Facturez dans une monnaie, encaissez dans une autre, rendez la monnaie dans une
troisième. Les deux ne sont jamais additionnées, et le taux retenu est celui du
jour de la vente.

LE CRÉDIT CLIENT
Accordez du crédit, fixez une échéance, suivez qui doit quoi et depuis combien de
temps. Les créances se trient par ancienneté, et vous appelez votre client depuis
l'écran.

LE RESTE
Stock et entrepôts, inventaire et comptage, transferts, réquisitions, devis et
retours, livre de caisse et dépenses, rapports, équipe et droits.

Le même établissement sur votre téléphone, votre terminal de caisse et votre
ordinateur.
```

### Ce que porte cette version

Référence interne, pas du texte de magasin.

- Point de vente hors ligne, impression du ticket et numérotation par appareil
- Stock, entrepôts, transferts, ajustements, réquisitions, déconditionnement
- Inventaire et feuille de comptage
- Clients, crédit, créances par ancienneté, fournisseurs
- Livre de caisse, dépenses, clôture Z
- Devis, retours de vente, documents imprimés
- Rapports (huit rubriques, servies par le serveur)
- Équipe, droits, parc de caisses, abonnement et paiement mobile
- 68 écrans, 1797 tests
