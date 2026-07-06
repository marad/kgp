# Korona Gór Polskich

Prosta strona do śledzenia zdobytych szczytów [Korony Gór Polskich](https://pl.wikipedia.org/wiki/Korona_Gór_Polskich)
(28 najwyższych szczytów polskich pasm górskich). Interaktywna mapa Polski
z oznaczonymi szczytami i większymi miastami jako punktami odniesienia.
Po najechaniu myszką na szczyt pokazuje się jego nazwa, pasmo, wysokość
i data zdobycia.

## Jak dodać zdobyty szczyt

Edytuj plik [`data/visited.json`](data/visited.json). To lista obiektów
`{ "peak": nazwa, "date": data }`:

```json
[
  { "peak": "Śnieżka", "date": "2023-07-15" },
  { "peak": "Rysy",    "date": "2024-08-02" }
]
```

- `peak` — nazwa szczytu **dokładnie** taka jak w [`data/peaks.json`](data/peaks.json).
- `date` — data w formacie `YYYY-MM-DD` (można pominąć, jeśli nieznana).

Szczyt oznaczony w tym pliku zmienia kolor na zielony i wlicza się do licznika postępu.

## Uruchomienie lokalnie

Strona wczytuje dane przez `fetch`, więc **nie zadziała** po otwarciu pliku
bezpośrednio z dysku (`file://`). Uruchom lokalny serwer:

```bash
python3 -m http.server
```

i wejdź na <http://localhost:8000>.

## Publikacja na GitHub Pages

1. Wrzuć zawartość tego katalogu do repozytorium na GitHubie.
2. W repozytorium: **Settings → Pages**.
3. W sekcji *Build and deployment* wybierz **Source: Deploy from a branch**,
   gałąź `main` (lub `master`) i katalog `/ (root)`.
4. Zapisz. Po chwili strona będzie dostępna pod
   `https://<użytkownik>.github.io/<repozytorium>/`.

## Pliki danych

| Plik | Zawartość |
|------|-----------|
| `data/peaks.json`   | 28 szczytów Korony Gór Polskich (nazwa, pasmo, wysokość, współrzędne, `dog`). |
| `data/cities.json`  | Większe miasta — punkty odniesienia na mapie. |
| `data/visited.json` | Twoja lista zdobytych szczytów z datami. |

> Współrzędne szczytów pochodzą z polskiej Wikipedii.
> W razie potrzeby możesz je doprecyzować w `data/peaks.json`.

Pole `dog` w `data/peaks.json` oznacza możliwość wejścia z psem:
`"ok"` (na smyczy dozwolony), `"limited"` (warunkowo — smycz / uwaga na rezerwat
lub wyznaczone szlaki), `"no"` (zakaz — park narodowy lub rezerwat). Informacja
pokazuje się w dymku szczytu z ikoną 🐕.
