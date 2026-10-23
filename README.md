# Deutschlandwetter

Statische Wetterseite für Deutschland auf Basis der **freien Open-Data-Angebote des Deutschen Wetterdienstes (DWD)** – ohne API-Key, ohne Backend, ohne Build-Schritt.

## Funktionen

- **Aktuelles Wetter** der nächstgelegenen DWD-Messstation (Temperatur, Wind, Böen, Luftfeuchte, Druck, Niederschlag, Sicht …)
- **24-Stunden-** und **7-Tage-Vorhersage** (DWD MOSMIX)
- **Amtliche Unwetterwarnungen** des DWD für den gewählten Ort
- **Karte** mit live **Niederschlagsradar** und **Warnkarte** (Gemeindeebene) vom DWD GeoServer
- Ortssuche, Standortbestimmung und Klick in die Karte; letzter Ort wird gemerkt
- Automatische Aktualisierung (Daten alle 15 min, Radar alle 5 min), Dark Mode

## Datenquellen

| Zweck | Quelle |
|---|---|
| Messwerte, Vorhersage, Warnungen | [Bright Sky](https://brightsky.dev) – freie JSON-API für [DWD Open Data](https://www.dwd.de/opendata) |
| Radar- & Warnkarte | [DWD GeoServer (WMS)](https://maps.dwd.de) |
| Ortssuche | [Open-Meteo Geocoding](https://open-meteo.com) |
| Kartengrundlage | © OpenStreetMap |

Die DWD-Daten stehen unter der [Nutzungsbedingung „Datenbasis: Deutscher Wetterdienst"](https://www.dwd.de/copyright) (CC BY 4.0).

## Lokal starten

```sh
cd site && python3 -m http.server 8000
# http://localhost:8000
```

## Veröffentlichen

- **GitHub Pages:** In *Settings → Pages* als Quelle **GitHub Actions** wählen. Der Workflow `.github/workflows/pages.yml` veröffentlicht den Ordner `site/` bei jedem Push.
- **GitLab Pages:** `.gitlab-ci.yml` kopiert `site/` nach `public/` und veröffentlicht es auf dem Default-Branch.
