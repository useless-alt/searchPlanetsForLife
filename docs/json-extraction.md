# Алгоритм извлечения данных из JSON-снимков

Документ описывает, как из локальных файлов `data/backups/**` получить
нормализованные строки и, при необходимости, объединённый каталог планет.
Он самодостаточен: для реализации не нужны интернет, исходный код проекта
или внешние библиотеки. Все константы, имена полей, единицы и правила
приведены ниже.

Входные данные — снимки, сделанные скриптом `scripts/fetch-sources.ps1`.
Имена и количество строк в примерах соответствуют снимку от 14.11.2026.

Если у модели ограничен контекст: для реализации только разбора и
нормализации достаточно §0–§4 и §8. Раздел §5 нужен только для слияния
источников в общий каталог.

---

## 0. Что подаётся на вход и что должно получиться

### 0.1. Файлы

```
data/backups/
├── manifest.json                  сводка по источникам
├── nasa/
│   └── latest.json                массив объектов
├── exoplanet_eu/
│   ├── latest.json                TAP: {contains, params, columns, data}
│   └── latest.objects.json        TAP, нормализованный в массив объектов
├── exomercat/
│   ├── latest.json                TAP: {metadata, data}
│   └── latest.objects.json
├── gaia/
│   ├── latest.json                TAP: {metadata, data}
│   └── latest.objects.json
├── simbad/
│   ├── latest.json                TAP: {metadata, data}
│   └── latest.objects.json
└── exomast/
    ├── index.json                 массив описаний скачанных планет
    ├── latest.json                сводный массив {planet, fetched_at, properties}
    ├── <slug>.json                сырой ответ по одной планете (массив блоков)
    └── YYYYMMDD_HHMMSS.json       версии для отката (игнорировать)
```

Правила выбора:

1. Для `nasa` читать `latest.json`.
2. Для `exoplanet_eu`, `exomercat`, `gaia`, `simbad` можно читать либо
   `latest.json`, либо `latest.objects.json`. Предпочтительно `latest.json`:
   это исходный ответ, в нём нет потерь точности (см. §8.1).
3. Для `exomast` читать `index.json`, затем перечисленные в нём файлы
   `<slug>.json`. `latest.json` — вторичный, но должен поддерживаться.
4. Файлы с датой в имени — исторические копии. Их не читать, иначе
   получатся дубликаты.
5. `manifest.json` — только для проверки количества записей и диагностики,
   не как источник самих данных.

### 0.2. Результат

Минимальный результат — массив нормализованных строк (§4):

```json
{
  "source": "nasa",
  "sourceIndex": 0,
  "name": "Kepler-257 d",
  "host": "Kepler-257",
  "letter": "d",
  "aliases": [],
  "status": "confirmed",
  "ra": 297.3159994,
  "dec": 46.0232642,
  "planet": {
    "radiusEarth": 4.95,
    "massEarth": 21.7,
    "massIsMinimum": false,
    "periodDays": 24.664551,
    "semiMajorAxisAU": 0.16,
    "eccentricity": 0,
    "insolationEarth": 15.2,
    "equilibriumTempK": 567
  },
  "star": {
    "teffK": 5180,
    "radiusSun": 1.037,
    "massSun": 0.916,
    "luminositySun": 0.4192,
    "spectralType": null,
    "distancePc": 780.256,
    "metallicityDex": 0.4
  },
  "ids": { "gaiaDr3": null, "tic": null }
}
```

Если нужен объединённый каталог, после нормализации выполняется слияние
(§5) и получаются сущности планет с выбранными значениями полей.

### 0.3. Краткий порядок действий

```text
1. Прочитать manifest.json и запомнить ожидаемые количества строк.
2. Загрузить NASA: latest.json — это уже массив объектов.
3. Загрузить Exoplanet.eu, Exo-MerCat, Gaia, SIMBAD:
   latest.json + имена колонок из metadata/columns -> массив объектов.
4. Загрузить Exo.MAST: index.json -> <slug>.json -> выбрать блок.
5. Каждую строку привести к канонической форме (§4):
   все числа через toNum, все строки через toStr, пустое -> null.
6. Проверить инварианты (§6.1) и количества (§6.2).
7. Если нужен общий каталог — слить по правилам §5.
8. Записать результат; исходные JSON не изменять.
```

---

## 1. Общие примитивы

### 1.1. Чтение JSON

Порядок обязателен:

```text
1. Прочитать файл как UTF-8.
2. Удалить BOM: если первый символ U+FEFF, отбросить его.
3. Удалить ведущие пробелы/переводы строк.
4. Если текст начинается с "<" (например, "<VOTABLE", "<!DOCTYPE", "<html"),
   это ошибка формата, а не JSON. Прервать разбор файла.
5. Выполнить JSON.parse (или аналог).
6. Если парсер не умеет большие целые — см. §8.1 для Gaia.
```

BOM может встречаться в файлах, записанных PowerShell. Игнорирование BOM —
частая причина ошибки «Unexpected token».

### 1.2. Приведение чисел

Функция `toNum(value)`:

```text
null / undefined                  -> null
number, конечное                 -> это число
number, NaN или ±Infinity        -> null
boolean                          -> null
string:
  trim
  пустая строка                  -> null
  "null", "nan" (без регистра)   -> null
  заменить "," на "."
  Number(...)
  не конечное число              -> null
остальные типы                   -> null
```

Важно: `0` — это валидное значение, а не «пусто». Нельзя использовать
`value || null`, иначе нули превратятся в `null`.

Функция `toStr(value)`:

```text
null / undefined -> null
иначе String(value).trim()
пустая строка -> null
```

Функция `pick(row, ...names)` ищет поле без учёта регистра. Для каждого
имени из списка: если в объекте есть ключ, равный имени без учёта регистра,
вернуть его значение. Иначе `null`.

### 1.3. Нормализация TAP-ответа

TAP-источники возвращают одну из форм:

| Форма | Признак | Пример |
|---|---|---|
| A. Массив объектов | `Array.isArray(json)` | NASA, `latest.objects.json` |
| B. `metadata` + `data` | `json.metadata[]`, `json.data[][]` | Exo-MerCat, Gaia, SIMBAD |
| C. `columns` + `data` | `json.columns[]`, `json.data[][]` | Exoplanet.eu |
| D. `data` из объектов | `json.data[]` — объекты | редко |
| E. `rows` | `json.rows[]` — объекты | внутренний формат приложения |

Алгоритм `normalizeTap(json)`:

```text
1. Если json — массив:
     вернуть все элементы, являющиеся объектами (не массивами, не null).

2. Если json — объект:
   2.1. Если json.rows — массив:
          вернуть все элементы-объекты.
   2.2. Если json.data — массив:
          2.2.1. Если все элементы data — объекты:
                   вернуть их как есть.
          2.2.2. Иначе:
                   names = первое непустое из:
                     json.metadata[].name
                     json.columns[].name
                     json.fields[].name
                     json.metadata[].column_name
                   Если names нет — ошибка формата.
                   Для каждой строки row:
                     out = {}
                     для i от 0 до names.length-1:
                       out[names[i]] = (i < row.length ? row[i] : null)
                     добавить out.
                   Вернуть out-строки.

3. Иначе — ошибка формата.
```

Имена колонок берутся **из метаданных**, а не из порядка, зашитого в код.
Порядок `data[i]` соответствует порядку `metadata[i]`/`columns[i]`.

### 1.4. Проверка формы

После разбора:

```text
rows.length > 0
каждая строка — объект
для TAP: длина каждой строки data равна длине metadata/columns
          (лишние значения игнорировать, недостающие считать null)
```

---

## 2. NASA Exoplanet Archive

Файл: `data/backups/nasa/latest.json`.

### 2.1. Форма

Корень — массив объектов, без обёртки. В снимке 6 470 строк, 22 поля
в каждой. Поле `pl_name` обязательно.

### 2.2. Поля

| JSON-поле | Тип | Единица | Куда идёт | Примечание |
|---|---|---|---|---|
| `pl_name` | string | — | `name` | обязательное; не пустое |
| `hostname` | string | — | `host` | имя звезды |
| `disc_year` | number | год | `discoveryYear` | |
| `discoverymethod` | string | — | `discoveryMethod` | |
| `pl_orbper` | number | сутки | `planet.periodDays` | |
| `pl_orbsmax` | number | AU | `planet.semiMajorAxisAU` | |
| `pl_orbeccen` | number | — | `planet.eccentricity` | |
| `pl_rade` | number | радиус Земли | `planet.radiusEarth` | |
| `pl_bmasse` | number | масса Земли | `planet.massEarth` | не умножать |
| `pl_dens` | number | г/см³ | `extra.density` | не входит в слияние |
| `pl_eqt` | number | K | `planet.equilibriumTempK` | |
| `pl_insol` | number | поток Земли | `planet.insolationEarth` | |
| `sy_snum` | number | — | `extra.starsCount` | |
| `sy_pnum` | number | — | `extra.planetsCount` | |
| `st_spectype` | string | — | `star.spectralType` | |
| `st_teff` | number | K | `star.teffK` | |
| `st_rad` | number | радиус Солнца | `star.radiusSun` | |
| `st_mass` | number | масса Солнца | `star.massSun` | |
| `st_lum` | number | log10(L/L☉) | `star.luminositySun` | **`10 ** st_lum`** |
| `st_met` | number | dex | `star.metallicityDex` | |
| `sy_dist` | number | пк | `star.distancePc` | |
| `ra` | number | градусы | `ra` | |
| `dec` | number | градусы | `dec` | |

`letter` вычисляется из `pl_name` по §5.2, потому что в снимке нет
`pl_letter`. `aliases` для NASA — пустой массив.

### 2.3. Необязательные поля live-запроса

Если в конкретном снимке встретятся дополнительные колонки, их нужно
поддержать, но их отсутствие не является ошибкой:

| Поле | Использование |
|---|---|
| `pl_letter` | готовое обозначение планеты; приоритетнее вычисленного |
| `pl_bmassprov` | если строка содержит `sin` (без регистра) — `massIsMinimum = true` |
| `pl_controv_flag` | `1` → `contested = true` |
| `tic_id`, `gaia_dr3_id`, `gaia_dr2_id` | идентификаторы для Gaia/SIMBAD |
| `sy_plx` | параллакс, мс; не заменяет `sy_dist` |
| `hd_name`, `hip_name`, `cb_flag` | дополнительные имена/флаги |

В текущем снимке этих полей нет. Следствие: **Gaia и SIMBAD из этих
бэкапов нельзя привязать к планетам NASA по `source_id`** — в NASA-строках
нет Gaia/TIC-идентификаторов. Gaia/SIMBAD в таком снимке — самостоятельные
каталоги, а не обогащение планет. Это ограничение данных, а не алгоритма.

### 2.4. Контрольная строка

Первая строка снимка:

```json
{"pl_name":"Kepler-257 d","hostname":"Kepler-257","disc_year":2014,
 "discoverymethod":"Transit","pl_orbper":24.664551,"pl_orbsmax":0.16,
 "pl_orbeccen":0,"pl_rade":4.95,"pl_bmasse":21.7,"pl_dens":0.983,
 "pl_eqt":567,"pl_insol":15.2,"sy_snum":1,"sy_pnum":3,
 "st_spectype":null,"st_teff":5180,"st_rad":1.037,"st_mass":0.916,
 "st_lum":-0.37756,"st_met":0.4,"sy_dist":780.256,
 "ra":297.3159994,"dec":46.0232642}
```

---

## 3. Остальные источники

### 3.1. Exoplanet.eu

Файл: `data/backups/exoplanet_eu/latest.json` (или `latest.objects.json`).

Корень:

```text
{
  "contains": "table",
  "params":   { "contains": "params" },
  "columns":  [ { "name": "...", "unit": "...", ... }, ... ],
  "data":     [ [значение, ...], ... ]
}
```

В снимке 8 477 строк и 23 колонки. `data[i][j]` соответствует
`columns[j].name`.

| Колонка | Единица | Куда идёт | Примечание |
|---|---|---|---|
| `target_name` | — | `name` | обязательное |
| `alt_target_name` | — | `aliases` | разделитель `#`; также запятая, `;`, вертикальная черта |
| `star_name` | — | `host` | |
| `radius` | радиус Юпитера | `planet.radiusEarth` | `* 11.209` |
| `mass` | масса Юпитера | `planet.massEarth` | `* 317.83` |
| `period` | сутки | `planet.periodDays` | fallback: `orbital_period` |
| `semi_major_axis` | AU | `planet.semiMajorAxisAU` | |
| `eccentricity` | — | `planet.eccentricity` | |
| `temp_calculated` | K | `planet.equilibriumTempK` | fallback: `temp_measured` |
| `temp_measured` | K | — | запасной вариант температуры |
| `star_teff` | K | `star.teffK` | |
| `star_radius` | радиус Солнца | `star.radiusSun` | |
| `star_mass` | масса Солнца | `star.massSun` | |
| `star_metallicity` | dex | `star.metallicityDex` | |
| `star_distance` | пк | `star.distancePc` | fallback: `distance` |
| `star_spec_type` | — | `star.spectralType` | fallback: `star_sp_type` |
| `ra` | градусы | `ra` | |
| `dec` | градусы | `dec` | |
| `discovered` | год | `discoveryYear` | |
| `updated` | строка | `extra.updated` | не число |
| `detection_type` | — | `discoveryMethod` | может содержать `#` |
| `mass_detection_type` | — | `extra.massDetectionType` | |
| `radius_detection_type` | — | `extra.radiusDetectionType` | |

`letter` — из `target_name` по §5.2. `status`: если есть
`publication_status`, то `confirm` → `confirmed`, а `candidate`, `false`,
`retract` → `candidate`, иначе `unknown`. В текущем снимке
`publication_status` нет, поэтому для самостоятельных строк EU статус
`unknown` (при совпадении с NASA статус берётся из NASA).

Важно: `alt_target_name` в реальных данных часто содержит несколько имён
через `#`, например:

```
1RXS J160929.1-210524 b#1RXS J1609b#1RXS J1609-2105b#RXJ 1609
```

Поэтому разбор альтернативных имён:

```text
split(/[#;,|]/)
  .map(trim)
  .filter(длина > 0)
```

`latest.objects.json` содержит те же 8 477 строк в виде объектов; поля
называются так же. Использовать его можно, но `latest.json` —
первоисточник.

Контрольная первая строка:

```json
{"target_name":"109 Psc b","alt_target_name":"HD 10697 b","star_name":"109 Psc",
 "radius":1.152,"mass":6.8,"period":1075.4,"semi_major_axis":2.051,
 "eccentricity":0.104,"temp_calculated":null,"temp_measured":null,
 "star_teff":5600,"star_radius":1.79,"star_mass":1.13,
 "star_metallicity":0.1,"star_distance":32.56,"star_spec_type":"G5IV",
 "ra":26.2326,"dec":20.08315,"discovered":2000,"updated":null,
 "detection_type":"Radial Velocity#Astrometry",
 "mass_detection_type":"Astrometry","radius_detection_type":"Theoretical"}
```

### 3.2. Exo-MerCat

Файл: `data/backups/exomercat/latest.json` (или `latest.objects.json`).

Корень `{ "metadata": [...], "data": [[...]] }`; 37 колонок, 17 617 строк.
Колонки берутся из `metadata[].name`.

Полный список колонок текущего снимка:

```
exomercat_name, nasa_name, toi_name, eu_name, host, main_id, main_id_ra,
main_id_dec, mass, mass_min, mass_max, msini, msini_min, msini_max,
bestmass, bestmass_min, bestmass_max, bestmass_provenance, bestmass_url,
p, p_min, p_max, r, r_min, r_max, a, a_min, a_max, e, e_min, e_max, i,
discovery_method, status, confirmed, discovery_year, main_id_aliases
```

| Колонка | Единица | Куда идёт | Примечание |
|---|---|---|---|
| `exomercat_name` | — | `name` | fallback: `name` |
| `nasa_name` | — | `aliases`, cross-link | пустая строка → null |
| `eu_name` | — | `aliases`, cross-link | пустая строка → null |
| `toi_name` | — | `aliases` | пустая строка → null |
| `host` | — | `host` | |
| `letter` | — | `letter` | fallback: из имени |
| `main_id` | — | `extra.mainId` | |
| `main_id_aliases` | — | `aliases` | обычно пусто |
| `main_id_ra` | градусы | `ra` | |
| `main_id_dec` | градусы | `dec` | |
| `mass` | масса Юпитера | `planet.massEarth` | `* 317.83` |
| `msini` | масса Юпитера | `planet.massEarth` | `* 317.83`, `massIsMinimum = true` |
| `r` | радиус Юпитера | `planet.radiusEarth` | `* 11.209` |
| `p` | сутки | `planet.periodDays` | |
| `a` | AU | `planet.semiMajorAxisAU` | |
| `e` | — | `planet.eccentricity` | |
| `i` | градусы | `planet.inclinationDeg` | |
| `discovery_method` | — | `discoveryMethod` | |
| `status` | — | `status` | см. ниже |
| `confirmed` | 0/1 | `extra.confirmed` | |
| `discovery_year` | год | `discoveryYear` | |

Правила:

- Масса: если `mass` не null — использовать его; иначе, если `msini` не
  null — использовать `msini` и пометить массу как минимальную.
- `mass_min`, `mass_max`, `msini_min`, `msini_max`, `bestmass*`, `p_min`,
  `p_max`, `r_min`, `r_max`, `a_min`, `a_max`, `e_min`, `e_max` — это
  границы/альтернативные оценки, **не** основные значения.
- `status`: строка без регистра; содержит `confirm` → `confirmed`;
  содержит `candidate` или `false` → `candidate`; иначе `unknown`.
- Имена `exomercat_name` могут содержать несколько пробелов и символ `*`
  (например, `"*   3 Cnc b"`). Для отображения сохранять как есть; для
  сопоставления использовать `normName` (§5.2).

Контрольная первая строка:

```json
{"exomercat_name":"*   3 Cnc b","nasa_name":"","toi_name":"","eu_name":"3 Cnc b",
 "host":"3 Cnc","main_id":"*   3 Cnc","main_id_ra":120.19711479666998,
 "main_id_dec":17.308700552619996,"mass":20.76,"mass_min":0.73,"mass_max":0.73,
 "msini":20.76,"msini_min":0.73,"msini_max":0.73,"bestmass":20.76,
 "bestmass_min":0.73,"bestmass_max":0.73,"bestmass_provenance":"Mass",
 "bestmass_url":"eu","p":853.64,"p_min":4.76,"p_max":4.76,
 "r":null,"r_min":null,"r_max":null,"a":2.52,"a_min":0.04,"a_max":0.04,
 "e":0.04,"e_min":0.03,"e_max":0.03,"i":null,
 "discovery_method":"Radial Velocity","status":"CONFIRMED","confirmed":1,
 "discovery_year":2020,"main_id_aliases":""}
```

### 3.3. Gaia DR3

Файл: `data/backups/gaia/latest.json` (или `latest.objects.json`).

Корень `{ "metadata": [...], "data": [[...]] }`; 13 колонок, 2 000 строк.

Колонки текущего снимка:

```
source_id, ra, dec, parallax, parallax_error, pmra, pmdec,
phot_g_mean_mag, bp_rp, ruwe, teff_gspphot, radius_gspphot, mass_flame
```

В другом снимке могут появиться `radius_flame`, `lum_flame`,
`parallax_over_error`; их нужно поддерживать, но в текущем файле их нет.

| Колонка | Единица | Куда идёт | Примечание |
|---|---|---|---|
| `source_id` | — | `ids.gaiaDr3` | **хранить строкой**; см. §8.1 |
| `ra` | градусы | `ra` | |
| `dec` | градусы | `dec` | |
| `parallax` | мс | `star.distancePc` | `1000 / parallax`, если `parallax > 0` |
| `parallax_error` | мс | `extra.parallaxError` | |
| `pmra` | мс/год | `extra.pmra` | |
| `pmdec` | мс/год | `extra.pmdec` | |
| `phot_g_mean_mag` | mag | `extra.gMag` | |
| `bp_rp` | mag | `extra.bpRp` | |
| `ruwe` | — | `extra.ruwe` | |
| `teff_gspphot` | K | `star.teffK` | |
| `radius_gspphot` | радиус Солнца | `star.radiusSun` | приоритетнее `radius_flame` |
| `radius_flame` | радиус Солнца | `star.radiusSun` | fallback |
| `mass_flame` | масса Солнца | `star.massSun` | |
| `lum_flame` | светимость Солнца | `star.luminositySun` | в текущем снимке отсутствует |

Если в ответе есть `parallax_over_error`, то для расстояния требовать
`parallax > 0` и (`parallax_over_error >= 5` или поле отсутствует).
В текущем снимке есть только `parallax_error`, поэтому дополнительный
фильтр по качеству неприменим.

Текущий Gaia-снимок — это `top 2000` источников с `parallax > 0` и
`ruwe < 1.4`, а не выборка звёзд-хозяев. Поэтому без списка `source_id`
из NASA привязать его к планетам нельзя. Если `ids.gaiaDr3` у планеты нет,
Gaia-строка остаётся самостоятельной записью.

Контрольная первая строка (значение `source_id` — как в исходном
`latest.json`; в `latest.objects.json` оно уже записано как
`137339207152695424` из-за потери точности — см. §8.1):

```json
{"source_id":137339207152695420,"ra":45.03068142477852,
 "dec":35.32503554723346,"parallax":0.9849359524622576,
 "parallax_error":0.47005448,"pmra":-2.1183850928901977,
 "pmdec":-0.9815350794641993,"phot_g_mean_mag":19.782421,
 "bp_rp":1.126236,"ruwe":1.0377263,"teff_gspphot":null,
 "radius_gspphot":null,"mass_flame":null}
```

### 3.4. SIMBAD

Файл: `data/backups/simbad/latest.json` (или `latest.objects.json`).

Корень `{ "metadata": [...], "data": [[...]] }`; 8 колонок, 5 000 строк.

| Колонка | Единица | Куда идёт | Примечание |
|---|---|---|---|
| `main_id` | — | `name` / `host` | основной идентификатор объекта |
| `ra` | градусы | `ra` | |
| `dec` | градусы | `dec` | |
| `otype_txt` | — | `extra.objectType` | это тип объекта, **не** спектральный класс |
| `sp_type` | — | `star.spectralType` | может быть null |
| `plx_value` | мс | `star.distancePc` | `1000 / plx_value`, если `plx_value > 0` |
| `pmra` | мс/год | `extra.pmra` | |
| `pmdec` | мс/год | `extra.pmdec` | |

В текущем снимке нет `query_id` (запрос был `select ... from basic`), поэтому
нельзя сказать, к какой планете относится строка. Это самостоятельный
каталог объектов. Если в другом снимке есть `query_id` (результат JOIN с
`ident`), то `query_id` — это точная строка идентификатора, по которой
искали планету; использовать её как ключ связи.

Контрольная первая строка:

```json
{"main_id":"LP  517-42","ra":321.05115814773,"dec":14.739140225440002,
 "otype_txt":"PM*","sp_type":null,"plx_value":13.273,
 "pmra":-149.739,"pmdec":-88.571}
```

### 3.5. Exo.MAST

Это не TAP. Есть три вида файлов.

#### `index.json`

Массив из 10 объектов:

```json
{
  "planet": "Proxima Centauri b",
  "http": "200",
  "bytes": 10184,
  "entries": 2,
  "json_valid": true,
  "file": "proxima_centauri_b.json",
  "error": ""
}
```

`entries` — число блоков в файле планеты. `json_valid = false` означает,
что файл использовать нельзя.

#### `<slug>.json`

Массив блоков (2–6 блоков на планету). Один блок — объект с полями
`canonical_name`, `planet_name`, `star_name`, `component`,
`catalog_name`, `disposition` и набором измерений.

Ключи измерений имеют суффиксы:

```
<key>          значение
<key>_unit     единица
<key>_upper    верхняя ошибка
<key>_lower    нижняя ошибка
<key>_ref      ссылка на источник (строка, может содержать HTML-entities)
<key>_url      URL источника
```

Базовые ключи в текущем снимке (45):

```
canonical_name, exoplanetID, catalog_name, planet_name, disposition,
modified_date, star_name, component,
Rs, Ms, Fe/H, stellar_gravity, Teff, Vmag, Jmag, Hmag, Kmag,
RA, DEC, distance, Rp, Mp, Tp, surface_gravity,
orbital_period, orbital_distance, inclination, eccentricity, omega,
transit_duration, transit_time, a/Rs, Rp/Rs, impact_parameter,
transit_depth, constellation, Tmag, SNR,
snr_emission_15, snr_emission_5, snr_transmission_K,
pmRA, pmDec, dayside_temperature, transit_flag
```

Ключи `Fe/H` и `a/Rs` содержат `/`; обращаться по точному имени, не через
точечную нотацию.

#### `latest.json`

Массив из 10 объектов:

```json
{
  "planet": "Proxima Centauri b",
  "fetched_at": "2026-11-14T02:06:08",
  "properties": { "value": [ ...блоки... ], "Count": 2 }
}
```

В снимках PowerShell свойство-массив сериализуется как
`{"value": [...], "Count": N}`. Это артефакт сериализации, а не часть API.
Поэтому `properties` надо разворачивать:

```text
если properties — массив            -> blocks = properties
иначе если properties.value — массив -> blocks = properties.value
иначе если properties — объект       -> blocks = [properties]
иначе                                -> blocks = []
```

#### Выбор блока

Правило приложения: выбрать блок, у которого `catalog_name` содержит
`nasa` (без учёта регистра); если такого нет — первый блок.

В текущих бэкапах каталоги называются `exoplanets.org`, `nexsci`, `toi`,
`TESS-DV`, `koi`; блока с `catalog_name`, содержащим `nasa`, нет. Значит,
для текущих файлов выбирается **первый блок**. Это важно: например, у
`Kepler-452 b` первый блок — `KOI 7016.01`, а не `Kepler-452 b`.

Если нужен более «официальный» набор, можно выбрать `nexsci` как
альтернативу, но это уже другое правило и оно изменит результаты.
Для воспроизводимости использовать правило выше.

#### Поля блока

| Ключ | Единица | Куда идёт | Примечание |
|---|---|---|---|
| `planet_name` | — | `name` | fallback: `canonical_name` |
| `canonical_name` | — | `extra.canonicalName` | |
| `star_name` | — | `host` | |
| `component` | — | `letter` | fallback: из имени |
| `catalog_name` | — | `extra.catalogName` | |
| `disposition` | — | `status` | см. ниже |
| `RA` | градусы | `ra` | |
| `DEC` | градусы | `dec` | |
| `distance` | пк | `star.distancePc` | unit обычно `pc` |
| `Teff` | K | `star.teffK` | |
| `Rs` | радиус Солнца | `star.radiusSun` | |
| `Ms` | масса Солнца | `star.massSun` | |
| `Fe/H` | dex | `star.metallicityDex` | |
| `Rp` | радиус Юпитера | `planet.radiusEarth` | `* 11.209` |
| `Mp` | масса Юпитера | `planet.massEarth` | `* 317.83` |
| `orbital_period` | сутки | `planet.periodDays` | |
| `orbital_distance` | AU | `planet.semiMajorAxisAU` | |
| `eccentricity` | — | `planet.eccentricity` | |
| `inclination` | градусы | `planet.inclinationDeg` | |
| `Tp` / `dayside_temperature` | K | `planet.equilibriumTempK` | если есть; это оценка температуры, не всегда Teq |

Единицы надо проверять по `<key>_unit`, а не только по имени ключа:

- `Mp_unit`: `M_Jupiter` → `* 317.83`; `M_Earth` → `* 1`.
- `Rp_unit`: `R_Jupiter` → `* 11.209`; `R_Earth` → `* 1`.
- `Rs_unit` / `Ms_unit`: солнечные единицы, обычно без преобразования.
- `distance_unit`: `pc` → как есть.
- `Teff_unit`: `K` → как есть.
- `inclination_unit`: `deg` → как есть.
- `orbital_period_unit`: `d` → как есть.
- `orbital_distance_unit`: `AU` → как есть.

Значения могут быть настоящим `null` или строкой `"null"` (иногда с
пробелом). Использовать `toNum`.

Статус:

```text
disposition содержит "confirmed" -> confirmed
disposition содержит "candidate" или "TCE" -> candidate
иначе -> unknown
```

HTML-entities в `*_ref` (`Su&aacute;rez`) для чисел не важны; если
показывать ссылки, декодировать отдельно.

Если в `latest.json` блоки уже выбраны (в текущем снимке это первый блок
каждой планеты), повторный выбор по §3.5 даст тот же результат.

---

## 4. Каноническая строка

Для каждой исходной строки строится объект:

```text
{
  source:        "nasa" | "exoplanet_eu" | "exomercat" | "gaia" | "simbad" | "exomast",
  sourceIndex:   индекс строки в исходном массиве,
  sourceFile:    путь к файлу,
  name:          string,
  host:          string | null,
  letter:        string | null,       // одна буква b..z
  aliases:       string[],
  status:        "confirmed" | "candidate" | "unknown",
  contested:     boolean,
  discoveryYear: number | null,
  discoveryMethod: string | null,
  ra:            number | null,
  dec:           number | null,
  planet: {
    radiusEarth:      number | null,
    massEarth:        number | null,
    massIsMinimum:    boolean,
    periodDays:       number | null,
    semiMajorAxisAU:  number | null,
    eccentricity:     number | null,
    inclinationDeg:   number | null,
    equilibriumTempK: number | null,
    insolationEarth:  number | null
  },
  star: {
    teffK:          number | null,
    radiusSun:      number | null,
    massSun:        number | null,
    luminositySun:  number | null,
    spectralType:   string | null,
    distancePc:     number | null,
    metallicityDex: number | null
  },
  ids: {
    gaiaDr3: string | null,
    tic:     string | null
  },
  extra: { ...произвольные поля источника... }
}
```

Правила заполнения:

- Все числовые поля проходят через `toNum`.
- Все текстовые — через `toStr`.
- Если исходное поле отсутствует, писать `null`, а не `0`, `""` или `NaN`.
- `massIsMinimum` — только для `msini`, `mass_sin_i`, `pl_bmassprov`
  с `sin`.
- `sourceIndex` нужен для трассировки и стабильной сортировки.

---

## 5. Слияние в сущности планет

Этот раздел нужен, если из строк требуется получить объединённый каталог.
Порядок этапов важен:

```text
1. NASA          — создаёт сущности
2. Exo-MerCat    — присоединяется к NASA или создаёт новые
3. Exoplanet.eu  — присоединяется к уже найденным или создаёт новые
4. Gaia          — обогащает по gaiaDr3
5. SIMBAD        — обогащает по gaiaDr3/tic
```

Exo.MAST в batch-слиянии текущего приложения не участвует (он ленивый),
но в таблице приоритетов ниже он указан. Если его добавлять, делать это
после каталогов как обычный источник полей.

### 5.1. Сущность

```text
{
  id:          "e0", "e1", ...,
  names:       string[],
  sources:     SourceId[],
  status:      "confirmed" | "candidate" | "unknown",
  contested:   boolean,
  hostName:    string | null,
  letter:      string | null,
  gaiaDr3Id:   string | null,
  ticId:       string | null,
  exomastName: string | null,
  fields:      { [fieldKey]: FieldValue },
  dedupWarnings: string[]
}
```

`FieldValue`:

```text
{
  value:        number | string | null,
  origin:       "measured",
  source:       SourceId,
  fetchedAt:    ISO-строка,
  tier:         "live" | "cache" | "snapshot",
  conflict:     boolean,
  alternatives: Candidate[],
  isMinMass?:   boolean
}
```

`Candidate`:

```text
{ value, source, fetchedAt, tier, isMinMass? }
```

Поля (`fieldKey`):

```
rade, masse, orbper, orbsmax, ecc, insol,
teff, rad, mass, lum, spectype, dist, ra, dec
```

### 5.2. Нормализация имён

`normName(value)`:

```text
1. Unicode NFKD.
2. toLowerCase().
3. Удалить все символы, кроме Unicode-букв и Unicode-цифр.
   Регулярное выражение: /[^\p{L}\p{N}]/gu -> ""
```

Примеры:

```
"*   3 Cnc b"      -> "3cncb"
"Kepler-257 d"     -> "kepler257d"
"TRAPPIST-1 e"     -> "trappist1e"
"109 Psc b"        -> "109pscb"
"WASP-39 b"        -> "wasp39b"
```

`planetLetter(name)`:

```text
trim()
проверить по порядку:
  /\s([b-z])$/i      // пробел + буква в конце
  /[-_]([b-z])$/i    // дефис/подчёркивание + буква
  /(\d)([b-z])$/i    // цифра + буква
вернуть первую найденную букву в нижнем регистре
иначе null
```

Буква `a` планетой не считается. Если в данных есть `pl_letter` или
`component`, использовать их вместо вычисления.

`hostKey(name)`:

```text
trim()
letter = planetLetter(name)
если letter найден:
  idx = последнее вхождение letter в нижнем регистре
  если idx > 0: обрезать хвост и убрать пробелы/дефисы/подчёркивания
вернуть normName(результат)
```

Индексы слияния:

```text
nameIndex:       normName(имя) -> entity.id
hostLetterIndex: normName(host) + ":" + letter -> entity.id
coordGrid:       "floor(ra/0.01):floor(dec/0.01)" -> [entity.id]
crossLinks:      normName(имя из Exo-MerCat) -> entity.id
```

`addName` добавляет имя в `entity.names`, если его там ещё нет, и
устанавливает `nameIndex`, только если ключ ещё не занят.

### 5.3. Сопоставление строк

Для NASA: каждая строка создаёт новую сущность. `status = confirmed`.
`contested = (pl_controv_flag == 1)`, если поле есть.

Для Exo-MerCat, по порядку:

```text
S0. Если nasa_name не пуст — найти по nameIndex(nasa_name).
    Если не найдено и eu_name не пуст — взять crossLinks(eu_name).
S1. Найти по nameIndex(exomercat_name).
S2. Найти по hostLetterIndex(host + ":" + letter).
S3. Найти по координатам (см. ниже).
Если ничего не найдено — создать новую сущность.
```

Для Exoplanet.eu:

```text
S0. Для [target_name, ...aliases] проверить crossLinks.
S1. Для [target_name, ...aliases] проверить nameIndex.
S2. Найти по hostLetterIndex(star_name + ":" + letter).
S3. Найти по координатам.
Если ничего не найдено — создать новую сущность.
```

При совпадении: добавить `source` в `entity.sources`, добавить имена,
зарегистрировать координаты. Статус объединять так:

```text
если status == confirmed -> entity.status = confirmed
иначе если status == candidate и entity.status == unknown -> candidate
```

Координатное сопоставление `matchByCoords(ra, dec, letter, period, axis)`:

```text
Если ra или dec null -> нет совпадения.

cellX = floor(ra / 0.01)
cellY = floor(dec / 0.01)

Для dx = -1..1, dy = -1..1:
  для каждого entity.id в coordGrid[(cellX+dx):(cellY+dy)]:
    sep = angularSeparationArcsec(ra, dec, entity.ra, entity.dec)
    если sep > 15 -> пропустить
    sameLetter = letter и entity.letter и letter == entity.letter
    periodClose = period и entity.period и |period-entity.period|/entity.period <= 0.015
    axisClose   = axis и entity.axis и |axis-entity.axis|/entity.axis <= 0.03
    если не sameLetter и не periodClose и не axisClose -> пропустить
    запомнить {entity, sep, periodDiff}
```

`angularSeparationArcsec`:

```text
toRad = pi / 180
dRa   = (ra1 - ra2) * toRad
dDec  = (dec1 - dec2) * toRad
mean  = ((dec1 + dec2) / 2) * toRad
x     = dRa * cos(mean)
y     = dDec
вернуть sqrt(x*x + y*y) / toRad * 3600
```

Выбор при нескольких кандидатах:

```text
если найден один -> он
иначе отсортировать по periodDiff
если минимальный periodDiff < 1 и он строго меньше следующего -> он
иначе -> не сливать, добавить предупреждение "координатное совпадение неоднозначно"
```

### 5.4. Кандидаты полей и приоритеты

При добавлении значения в сущность создаётся кандидат:

```text
{ value, source, fetchedAt, tier, isMinMass? }
```

Дубликаты с одинаковыми `source` и `value` не добавляются.

Приоритет источников для выбора значения:

| Поле | Порядок |
|---|---|
| `teff` | gaia, nasa, exoplanet_eu, exomast |
| `rad` | gaia, nasa, exoplanet_eu, exomast |
| `mass` | gaia, nasa, exoplanet_eu, exomast |
| `lum` | gaia, nasa, exoplanet_eu, exomast |
| `rade` | nasa, exomast, exomercat, exoplanet_eu |
| `masse` | nasa, exomast, exomercat, exoplanet_eu |
| `orbper` | nasa, exomast, exomercat, exoplanet_eu |
| `orbsmax` | nasa, exomast, exomercat, exoplanet_eu |
| `ecc` | nasa, exomast, exomercat, exoplanet_eu |
| `insol` | nasa, exomast, exoplanet_eu |
| `dist` | nasa, exoplanet_eu, gaia, simbad |
| `spectype` | simbad, nasa, exoplanet_eu |
| `ra` | nasa, simbad, gaia, exoplanet_eu, exomercat |
| `dec` | nasa, simbad, gaia, exoplanet_eu, exomercat |

Источник, которого нет в списке, получает индекс `длина_списка + 1`.

Для `masse`: кандидаты с `isMinMass = true` идут после кандидатов с
`isMinMass = false`, независимо от приоритета источника.

### 5.5. Единицы и преобразования

| Величина | Из | В | Множитель / формула |
|---|---|---|---|
| Масса планеты | масса Юпитера | масса Земли | `* 317.83` |
| Радиус планеты | радиус Юпитера | радиус Земли | `* 11.209` |
| Светимость звезды | `st_lum` | L☉ | `10 ** st_lum` |
| Расстояние | параллакс, мс | пк | `1000 / plx`, только `plx > 0` |
| Gaia расстояние | `parallax` | пк | `1000 / parallax`; при наличии `parallax_over_error` требовать `>= 5` |
| SIMBAD расстояние | `plx_value` | пк | `1000 / plx_value`, только `> 0` |

Массы и радиусы NASA и Exoplanet.eu уже в земных единицах после
преобразования; Exo-MerCat и Exo.MAST — в юпитерианских.

### 5.6. Разрешение конфликтов

Допуски (`CONSENSUS_TOLERANCE`):

| Поле | Относительный допуск | Абсолютный допуск |
|---|---|---|
| `teff` | 0.08 | — |
| `rad` | 0.25 | — |
| `lum` | 0.40 | — |
| `mass` | 0.25 | — |
| `rade` | 0.20 | — |
| `masse` | 0.40 | — |
| `orbper` | 0.01 | — |
| `orbsmax` | 0.05 | — |
| `dist` | 0.10 | — |
| `ecc` | — | 0.10 |

Алгоритм `resolveField(entity, key)`:

```text
1. Взять всех кандидатов поля.
2. Отсортировать:
   - для masse: сначала isMinMass=false, затем true;
   - внутри — по приоритету источника (меньше индекс — важнее).
3. chosen = первый кандидат.
4. numericValues = все числовые значения кандидатов.
5. Если numericValues.length >= 2 и chosen.value — число:
     med = медиана(numericValues)
     tol = допуск для key
     if med != null и chosen.value вне допуска от med:
        if кандидатов ровно 2:
            conflict = true
        else:
            nearest = кандидат, ближайший к med
            chosen = nearest
            conflict = (nearest.source != первый.source)
     else if med != null:
        spread = max(numericValues) - min(numericValues)
        allowed = tol.abs ?? (med != 0 ? |med| * tol.rel : 0)
        if allowed > 0 и spread > allowed:
            conflict = true
6. alternatives = все кандидаты, кроме chosen.
7. Вернуть FieldValue.
```

«Вне допуска»:

```text
если tol.abs задан: |value - med| > tol.abs
иначе если med == 0: value != 0
иначе: |value - med| / |med| > tol.rel
```

Медиана:

```text
отсортировать конечные числа
если чётное количество: среднее двух центральных
иначе центральный элемент
```

### 5.7. Обогащение Gaia и SIMBAD

Gaia:

```text
для каждой сущности с gaiaDr3Id:
  key = строка source_id без префикса "Gaia DR3 "
  row = gaiaMap.get(key)
  если row найден:
    sources += gaia
    teff = teff_gspphot
    rad  = radius_gspphot, иначе radius_flame
    mass = mass_flame
    lum  = lum_flame
    dist = 1000 / parallax, если parallax > 0 и качество проходит
```

SIMBAD:

```text
для каждой сущности:
  keys = [gaiaDr3Id, ticId] (непустые)
  row = первая найденная строка по этим ключам
  если row найден:
    sources += simbad
    spectype = sp_type
    dist = 1000 / plx_value, если plx_value > 0
    ra = ra
    dec = dec
```

В текущих бэкапах `gaiaMap` и `simbadMap` не с чем сопоставлять: у NASA нет
идентификаторов, а у Gaia/SIMBAD нет `query_id`. Поэтому на этих файлах
обогащение фактически не выполнится. Это ожидаемо; алгоритм должен
обработать это без ошибки.

---

## 6. Валидация

### 6.1. Инварианты

```text
1. JSON разобран, BOM удалён.
2. Ответ не начинается с "<".
3. rows.length > 0.
4. Каждая строка — объект.
5. Для TAP: длина каждой строки data равна числу колонок.
6. Нет значений NaN/Infinity в нормализованных числах.
7. У каждой нормализованной строки непустой name.
8. Для Exo.MAST: index.json прочитан, каждый json_valid=true файл
   существует и содержит непустой массив блоков.
```

### 6.2. Контрольные значения текущего снимка

| Источник | Файл | Строк | Колонок / блоков |
|---|---|---|---|
| NASA | `nasa/latest.json` | 6 470 | 22 поля |
| Exoplanet.eu | `exoplanet_eu/latest.json` | 8 477 | 23 колонки |
| Exo-MerCat | `exomercat/latest.json` | 17 617 | 37 колонок |
| Gaia | `gaia/latest.json` | 2 000 | 13 колонок |
| SIMBAD | `simbad/latest.json` | 5 000 | 8 колонок |
| Exo.MAST | `exomast/index.json` | 10 планет | 33 блока суммарно |

Число блоков Exo.MAST по планетам в порядке `index.json`:

```
Proxima Centauri b  2
TRAPPIST-1 e        2
Kepler-452 b        3
TOI-700 d           6
WASP-39 b           3
55 Cnc e            4
GJ 1214 b           2
K2-18 b             4
HD 209458 b         4
Kepler-186 f        3
```

При новых снимках числа могут измениться. Жёстко проверять их имеет смысл
только для фиксированного набора файлов; в общем случае проверять
инварианты из §6.1 и сверять с `manifest.json`.

### 6.3. Контрольные преобразования

```
NASA:
  st_lum = -0.37756  -> luminositySun = 10 ** -0.37756 ≈ 0.4192
  pl_rade = 4.95     -> radiusEarth = 4.95
  pl_bmasse = 21.7   -> massEarth = 21.7

Exoplanet.eu:
  radius = 1.152     -> radiusEarth = 1.152 * 11.209 ≈ 12.913
  mass = 6.8         -> massEarth = 6.8 * 317.83 ≈ 2161.244

Exo-MerCat:
  mass = 20.76       -> massEarth = 20.76 * 317.83 ≈ 6598.15
  r = 1.97           -> radiusEarth = 1.97 * 11.209 ≈ 22.082

Exo.MAST:
  Mp = 0.284338 M_Jupiter -> massEarth ≈ 90.37
  Rp = 1.27 R_Jupiter     -> radiusEarth ≈ 14.235
```

---

## 7. Псевдокод целиком

```text
main(root):
    manifest = loadJson(root + "/manifest.json")
    nasa     = loadNasa(root + "/nasa/latest.json")
    eu       = loadTap(root + "/exoplanet_eu/latest.json")
    exo      = loadTap(root + "/exomercat/latest.json")
    gaia     = loadTap(root + "/gaia/latest.json")
    simbad   = loadTap(root + "/simbad/latest.json")
    exomast  = loadExoMast(root + "/exomast")

    rows = []
    rows += normalizeNasa(nasa)
    rows += normalizeEu(eu)
    rows += normalizeExoMerCat(exo)
    rows += normalizeGaia(gaia)
    rows += normalizeSimbad(simbad)
    rows += normalizeExoMast(exomast)

    validate(rows, manifest)
    entities = merge(rows)
    return { rows, entities }
```

```text
loadNasa(path):
    json = loadJson(path)
    если не массив -> ошибка
    вернуть json (это уже объекты)

loadTap(path):
    json = loadJson(path)
    вернуть normalizeTap(json)

loadExoMast(dir):
    index = loadJson(dir + "/index.json")
    результат = []
    для entry в index:
        если !entry.json_valid -> пропустить
        blocks = loadJson(dir + "/" + entry.file)
        если blocks не массив -> пропустить
        выбрать block по §3.5
        результат.push({ planet: entry.planet, block })
    вернуть результат
```

```text
normalizeNasa(json):
    out = []
    для row, i в json:
        name = toStr(pick(row, "pl_name"))
        если !name -> пропустить
        letter = toStr(pick(row, "pl_letter")) ?? planetLetter(name)
        out.push({
            source: "nasa",
            sourceIndex: i,
            name,
            host: toStr(pick(row, "hostname")),
            letter,
            aliases: [],
            status: "confirmed",
            contested: toNum(pick(row, "pl_controv_flag")) == 1,
            discoveryYear: toNum(pick(row, "disc_year")),
            discoveryMethod: toStr(pick(row, "discoverymethod")),
            ra: toNum(pick(row, "ra")),
            dec: toNum(pick(row, "dec")),
            planet: {
                radiusEarth: toNum(pick(row, "pl_rade")),
                massEarth: toNum(pick(row, "pl_bmasse")),
                massIsMinimum: contains(toStr(pick(row, "pl_bmassprov")), "sin"),
                periodDays: toNum(pick(row, "pl_orbper")),
                semiMajorAxisAU: toNum(pick(row, "pl_orbsmax")),
                eccentricity: toNum(pick(row, "pl_orbeccen")),
                inclinationDeg: null,
                equilibriumTempK: toNum(pick(row, "pl_eqt")),
                insolationEarth: toNum(pick(row, "pl_insol"))
            },
            star: {
                teffK: toNum(pick(row, "st_teff")),
                radiusSun: toNum(pick(row, "st_rad")),
                massSun: toNum(pick(row, "st_mass")),
                luminositySun: pow10OrNull(toNum(pick(row, "st_lum"))),
                spectralType: toStr(pick(row, "st_spectype")),
                distancePc: toNum(pick(row, "sy_dist")),
                metallicityDex: toNum(pick(row, "st_met"))
            },
            ids: {
                gaiaDr3: toStr(pick(row, "gaia_dr3_id", "gaia_dr2_id")),
                tic: toStr(pick(row, "tic_id"))
            }
        })
    вернуть out
```

Аналогичные функции для остальных источников строятся по таблицам §3.
Ключевое правило: каждое числовое поле — через `toNum`, каждое текстовое —
через `toStr`, отсутствующее — `null`.

---

## 8. Подводные камни

### 8.1. Gaia `source_id` и точность целых в JavaScript

В `gaia/latest.json` значение может быть больше `Number.MAX_SAFE_INTEGER`
(9 007 199 254 740 991). Например:

```
137339207152695420
```

`JSON.parse` в JavaScript превращает его в число с потерей точности:

```js
137339207152695420 -> 137339207152695420 (display)
BigInt(Number)     -> 137339207152695424n
```

То есть фактическое значение изменилось на 4. В
`gaia/latest.objects.json` число уже записано как `137339207152695424` —
PowerShell тоже потерял точность при нормализации.

В Python такой проблемы нет: `int` произвольной точности. В JavaScript
нужен один из вариантов ниже.

Правильные варианты:

1. Читать `gaia/latest.json` как текст и перед `JSON.parse` заменить
   `"source_id":<цифры>` на `"source_id":"<цифры>"` (или использовать
   BigInt-aware парсер). Тогда ID останется строкой без потерь.
2. Если ID не нужен для сопоставления, а нужен только как подпись,
   можно использовать `latest.objects.json`, но помнить о потере точности.
3. Никогда не сравнивать `Number` из `objects` с точной строкой из
   исходного JSON.

Для остальных источников настолько больших чисел в текущем снимке нет.

### 8.2. BOM

Некоторые файлы могут начинаться с `U+FEFF`. Всегда удалять BOM перед
разбором. Иначе строгий JSON-парсер выдаст ошибку на первом символе.

### 8.3. `<VOTABLE>` при HTTP 200

Ошибка TAP может прийти с кодом 200 и телом `<VOTABLE ...>`. Проверять
именно начало тела, а не HTTP-статус.

### 8.4. Exo.MAST `properties` — не всегда массив

В `latest.json` это `{"value": [...], "Count": N}`. В live-ответе —
массив. Поддерживать обе формы.

### 8.5. Exo.MAST: несколько блоков на планету

Один и тот же объект может быть в каталогах `exoplanets.org`, `nexsci`,
`toi`, `TESS-DV`, `koi` с разными числами. Без явного правила выбора
результат недетерминирован. Использовать правило §3.5: `nasa` → первый
блок.

### 8.6. Exoplanet.eu: `alt_target_name` через `#`

Не ограничиваться запятыми. В текущих данных `#` — основной разделитель
альтернативных имён. Иначе большая часть альтернативных имён попадёт в
одну строку и не будет находиться при слиянии.

### 8.7. Exo-MerCat: масса и `msini`

`mass` и `msini` — разные величины. Если есть `mass`, использовать его;
`msini` — только fallback с флагом минимальной массы. Не складывать и не
усреднять их как равноправные измерения.

### 8.8. NASA: `st_lum` — логарифм

`st_lum` — это `log10(L/L☉)`, а не светимость. Для поля `lum` нужно
`10 ** st_lum`. Если сохранить как есть, светимость будет отрицательной
для большинства звёзд.

### 8.9. Пустые строки и `"null"`

В TAP и Exo.MAST пустое значение может быть `null`, `""`, `"null"`,
`"nan"`. Все три варианта должны давать `null`, а не `0` и не строку.

### 8.10. Отсутствующие колонки

Снимок NASA содержит только 22 колонки из расширенного live-запроса.
Код не должен падать, если нет `pl_letter`, `tic_id`, `gaia_dr3_id`,
`pl_bmassprov` и т.п. Использовать fallback и `null`.

### 8.11. Gaia/SIMBAD не привязаны к планетам в этих бэкапах

В NASA-снимке нет Gaia/TIC id; в Gaia/SIMBAD-снимках нет `query_id`.
Поэтому нельзя получить «звёздные параметры для каждой планеты» только
из этих файлов. Нужен либо другой снимок NASA с id, либо отдельная
таблица соответствия. Алгоритм должен явно сообщать об этом, а не
подставлять случайные строки.

### 8.12. Дубликаты версий

Файлы `YYYYMMDD_HHMMSS.json` — копии `latest.json`. Не читать их вместе
с `latest.json`, иначе каждая планета появится несколько раз.

---

## 9. Минимальный чек-лист реализации

```text
[ ] loadJson: UTF-8, BOM, проверка "<", JSON.parse
[ ] toNum: null/""/"null"/"nan"/boolean -> null; "," -> "."
[ ] toStr: trim, пустое -> null
[ ] pick: поиск без учёта регистра
[ ] normalizeTap: array / metadata / columns / fields / rows
[ ] NASA: 22 поля, st_lum -> 10**, letter из имени
[ ] Exoplanet.eu: columns+data, масса/радиус Юпитера -> Земля
[ ] Exo-MerCat: metadata+data, mass/msini, r, p, a, e
[ ] Gaia: source_id строкой, parallax -> pc, radius fallback
[ ] SIMBAD: sp_type, plx_value -> pc
[ ] Exo.MAST: index.json, per-planet blocks, properties.value
[ ] Exo.MAST: выбор блока nasa -> первый
[ ] Canonical row: null вместо 0/NaN
[ ] normName, planetLetter, hostLetter
[ ] match: cross-link -> name -> host+letter -> coords
[ ] units: 317.83 / 11.209 / 1000/plx / 10**lum
[ ] conflict: priority + median + tolerance
[ ] validation: counts, row lengths, name non-empty
```
