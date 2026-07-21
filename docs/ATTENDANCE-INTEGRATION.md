# Integrace docházkových terminálů

## Doporučení

Jako prvního partnera oslovit **GIRITON Systems s.r.o.** Jejich oficiální
materiály uvádějí nástěnné píchačky (RFID/NFC, karty, PIN, QR i otisk), exporty
na míru a REST API pro čtení i zápis docházky:

- [Docházkový systém GIRITON](https://giriton.com/cs/dochazkovy-system)
- [Propojení přes REST API](https://giriton.com/cs/integrace/rest-api)
- [Import docházky z jiných systémů](https://docs-cs.giriton.com/article/270-import-dochazky-z-jinych-systemu)

Výběr není technický lock-in. LawOffice nyní přijímá vendor-neutrální CSV,
takže lze použít také Alveno, Aktion nebo jiného dodavatele, pokud umí exportovat
osobní číslo, datum, příchod, odchod a přestávku.

## Podporované CSV

Středník je oddělovač, desetinná čárka je povolená a hlavičky mohou být česky
nebo anglicky v libovolném pořadí.

Terminálové průchody:

```csv
osobniCislo;datum;prichod;odchod;prestavka
1001;2026-07-21;08:01;16:35;0,5
```

Denní součty:

```csv
osobniCislo;datum;odpracovano;prestavka
1001;2026-07-21;8;0,5
```

Import je atomický, odmítá neznámá osobní čísla, duplicity a neplatné směny.
Každý úspěšný běh má unikátní `importBatchId` a auditní záznam.

## Další krok pro automatickou synchronizaci

Po výběru dodavatele získat jeho API dokumentaci a testovací tenant. Následně
doplnit read-only synchronizační adaptér, mapování ID zaměstnanců, inkrementální
kurzor, opakování po chybě a tajné údaje uložit pouze do serverového prostředí.
Před produkcí uzavřít zpracovatelskou smlouvu a ověřit retenční dobu i práci s
biometrickými údaji; LawOffice má přebírat jen provozní docházková data, ne
biometrické šablony.
