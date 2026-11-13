# Demify – Projektübersicht

Stand: 13. November 2026, Phase 1 abgeschlossen, aus Phase 2 ist die Körperkarte fertig (Branch `Phase-1`).

## Worum es geht

Demify ist unser Beitrag zur NASA Space Apps Challenge „Create Health Monitoring Software for Astronauts on Space Missions". Die Aufgabe: eine visuelle Software, die Gesundheitswerte sammelt und Astronauten hilft, ihren Zustand selbst einzuschätzen und zu handeln.

Unsere Leitidee ist der **autonome Bord-Sanitäter**. Auf dem Weg zum Mars braucht ein Funksignal bis zu 20 Minuten pro Richtung, der Arzt auf der Erde ist also nicht sofort erreichbar. Die Software muss deshalb selbst einschätzen, erklären und sagen, was jetzt zu tun ist.

## Die drei Prinzipien

- **Persönliche Baseline statt nur Normwerte:** Ein Wert kann laut Lehrbuch normal sein und trotzdem auffallen, weil er vom eigenen Vor-Flug-Durchschnitt abgewichen ist.
- **Zusammenhänge statt Einzelwerte:** Mehrere Werte zusammen zeigen oft die Ursache, nicht nur das Symptom.
- **Klare Triage mit Handlungsanweisung:** Jede Auffälligkeit endet in einem konkreten nächsten Schritt.

## Was heute funktioniert

| Bereich | Umsetzung |
|---|---|
| Messwerte | Ruhepuls, Blutdruck, Körpertemperatur, Blutsauerstoff, Nüchternzucker, Schlaf, Stimmung, Training, Kabinen-CO₂ |
| Körperkarte | Klickbare Figur mit sieben Körpersystemen (Gehirn, Augen, Immunsystem, Lunge, Herz, Stoffwechsel, Knochen und Muskeln). Jeder Marker zeigt den Status; die Auswahl erklärt Funktion, Wirkung der Raumfahrt, Schutzmaßnahmen und die zugehörigen Messwerte |
| Triage | Vier Stufen: Nominal, Watch (selbst handeln), Act (Crew Medical Officer), Critical (Flight Surgeon). Jede Stufe hat eigene Farbe und eigene Icon-Form |
| Baseline-Drift | 7-Tage-Durchschnitt gegen den Vor-Flug-Wert, inklusive Dauer („seit 6 Tagen") |
| Muster | Möglicher Infekt (Fieber plus Puls), Schlafmangel plus Stimmungstief, CO₂ als Ursache schlechten Schlafs, Herz-Kreislauf-Abbau bei Trainingsausfall |
| Erinnerungen | Veraltete Messwerte werden nicht bewertet; die App fordert zur neuen Messung auf |
| Eingabe | Werte von Hand eintragen, Prüfung im Browser und auf dem Server, Speicherung serverseitig |
| Verlauf | Mini-Kurve pro Kachel, Detail-Chart mit Normbereich und Baseline, Tabellenansicht |
| Demo | Simulierte 180-Tage-Mission mit eingebauten Ereignissen und Zeitraffer |
| Quellen | Jede Messgröße verlinkt auf den passenden Hazard und das Risiko im NASA Human Research Program |

Interessante Tage in der Simulation: 42 (CO₂ plus Schlafmangel), 74 (Infekt), 90 (fällige Messung), 130 (Trainingsausfall), 153 (Unterzucker).

## Technik

- **Framework:** Next.js 16 mit React 19 und TypeScript. Der Server spielt die Rolle des Bordcomputers.
- **Oberfläche:** Tailwind CSS 4, Charts mit Recharts, ein dunkles Cockpit-Design.
- **Tests:** Vitest, 31 Unit-Tests für Regel-Engine, Simulator und Körperkarte.
- **Container:** `Dockerfile` und `compose.yaml` bauen ein eigenständiges Image; Messdaten liegen in einem Volume.

| Ordner | Inhalt |
|---|---|
| `src/domain` | Kernlogik ohne Framework: Metrik-Katalog mit Grenzwerten, Körpersysteme, Regel-Engine, Simulator, Validierung |
| `src/server` | Speicher für von Hand eingetragene Messwerte (JSON-Datei) |
| `src/app` | Next.js-Seite und Server Actions |
| `src/ui` | Dashboard-Komponenten |

## Starten

Lokal (Node.js 20.9 oder neuer):

```bash
npm install
```

```bash
npm run dev
```

Als Container:

```bash
docker compose up --build
```

Danach jeweils <http://localhost:3000> öffnen.

## Fahrplan

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Datenmodell, Simulator, Regel-Engine, Dashboard mit Farbcodes | Fertig |
| 2 | Klickbare Körperkarte, ausführlichere Anleitungen pro Befund | Körperkarte fertig, Schritt-für-Schritt-Anleitungen offen |
| 3 | Echte Messungen: Bluetooth-Geräte, Puls per Webcam, Reaktionstest, Sehtest | Offen |
| 4 | Missionskontext (ISS, Mond, Mars), Weltraumwetter mit NASA-Daten, Funkverzögerungs-Modus | Offen |
| 5 | Gamification, Feinschliff, Pitch | Offen |

## Bekannte Grenzen

- **Ein Crew-Mitglied, kein Login:** Für mehrere Nutzer fehlen Konten und Rechte.
- **Speicher ist eine JSON-Datei:** Reicht für einen Container auf einem Rechner. Für Mehrbenutzer-Betrieb oder Serverless-Hosting braucht es eine Datenbank.
- **Sensordaten sind simuliert:** Echte Geräte kommen in Phase 3.
- **Grenzwerte sind Demo-Werte:** Sie stammen aus allgemeinen klinischen Richtlinien, sind keine Flugregeln und keine medizinische Beratung.
- **Augen ohne Messwert:** Das Körpersystem ist auf der Karte erklärt, ein Sehtest kommt in Phase 3.
- **Strahlung fehlt noch:** Der fünfte NASA-Hazard hat bisher keine Messgröße; er kommt mit Phase 4.

## Offene Entscheidungen

- **Datenbank:** Empfehlung ist SQLite im Container, sobald mehrere Nutzer gebraucht werden.
- **Hardware:** Gibt es einen Bluetooth-Brustgurt oder eine Bluetooth-Blutdruckmanschette für die Demo?
- **Deadline und Teamgröße:** Davon hängt ab, wie viel von Phase 3 realistisch ist.

## Quellen

- [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/) und [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/), NASA Human Research Program
- [Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp), Canadian Space Agency
- ACC/AHA 2017 (Blutdruck), American Diabetes Association (Blutzucker), American Academy of Sleep Medicine (Schlaf)
- Stahn et al., *Scientific Reports*, 2017 (Körpertemperatur im All); Barger et al., *Lancet Neurology*, 2014 (Schlaf auf der ISS)
