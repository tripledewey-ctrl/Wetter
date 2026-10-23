# Deutschlandwetter

Statische Wetterseite für Deutschland auf Basis der **freien Open-Data-Angebote des Deutschen Wetterdienstes (DWD)** – ohne API-Key, ohne Backend, ohne Build-Schritt.

## Funktionen

- **Aktuelles Wetter** der nächstgelegenen DWD-Messstation (Temperatur, Wind, Böen, Luftfeuchte, Druck, Niederschlag, Sicht …)
- **24-Stunden-** und **7-Tage-Vorhersage** (DWD MOSMIX)
- **Amtliche Unwetterwarnungen** des DWD für den gewählten Ort
- **Karte** mit live **Niederschlagsradar** und **Warnkarte** (Gemeindeebene) vom DWD GeoServer
- Schnellwahl für **Wiesbaden** (Standard), **Hamburg** und **Rendsburg**
- Ortssuche, Standortbestimmung und Klick in die Karte; letzter Ort wird gemerkt
- **Wind & Nordsee** (`wind.html`): Windübersicht über 10 Tage für die niederländische Küste
  (Vlissingen, Scheveningen, IJmuiden, Den Helder, Terschelling) und die deutsche Nordsee
  (Borkum, Norderney, Helgoland, Cuxhaven, St. Peter-Ording, Sylt) in Knoten/Beaufort/km/h/m/s,
  stündliche Wind-, Böen- und Luftdruckkurve, Wellenhöhe, Tagesprognose sowie eine
  **Isobarenkarte** (Bodendruck mit Hoch/Tief und Windpfeilen, Zeitregler über 7 Tage)
- Automatische Aktualisierung (Daten alle 15 min, Radar alle 5 min), Dark Mode

## Datenquellen

| Zweck | Quelle |
|---|---|
| Messwerte, Vorhersage, Warnungen | [Bright Sky](https://brightsky.dev) – freie JSON-API für [DWD Open Data](https://www.dwd.de/opendata) |
| Radar- & Warnkarte | [DWD GeoServer (WMS)](https://maps.dwd.de) |
| Ortssuche | [Open-Meteo Geocoding](https://open-meteo.com) |
| Wind, Isobaren, Mehrtagesprognose | [Open-Meteo](https://open-meteo.com) (DWD ICON, KNMI HARMONIE) |
| Wellen | [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api) |
| Kartengrundlage | © OpenStreetMap |

Die DWD-Daten stehen unter der [Nutzungsbedingung „Datenbasis: Deutscher Wetterdienst"](https://www.dwd.de/copyright) (CC BY 4.0).

## Lokal starten

```sh
cd site && python3 -m http.server 8000
# http://localhost:8000
```

## Veröffentlichen

- **GitHub Pages:** Der Workflow `.github/workflows/pages.yml` veröffentlicht den Ordner `site/` bei jedem Push auf `main`
  (oder manuell über *Actions → GitHub Pages → Run workflow*). Live unter https://tripledewey-ctrl.github.io/Wetter/.
  Voraussetzungen:
  - *Settings → Pages*: Quelle **GitHub Actions**
  - *Settings → Environments → github-pages*: Branch `main` unter *Deployment branches and tags* erlaubt
  - Änderungen auf einem Arbeitsbranch entwickeln und per Pull Request nach `main` mergen
- **GitLab Pages:** `.gitlab-ci.yml` kopiert `site/` nach `public/` und veröffentlicht es auf dem Default-Branch.
