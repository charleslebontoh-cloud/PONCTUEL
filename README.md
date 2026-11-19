# Ponctuel

Navigation anti-retard : itinéraires qui évitent les bouchons (trafic TomTom en direct), vue satellite automatique des embouteillages, planificateur « arriver à l'heure », guidage vocal en français, mémoire des lieux fréquentés et des rues lentes.

En ligne : https://charleslebontoh-cloud.github.io/PONCTUEL/

Voir `LISEZMOI.md` pour l'installation sur téléphone.

## Tests automatiques

`npm test` lance l'appli en local et rejoue 12 scénarios avec GPS, trafic et cartes simulés : guidage complet, bouchon en accordéon, arrêt dans un bouchon, sortie de route, contournement, sondes de trafic, estimation, réveil, IA, mode Réel, carte TomTom, ouverture.
Le workflow `.github/workflows/tests.yml` les rejoue à chaque modification et chaque nuit, et ouvre une issue en cas d'échec.
