# Источники данных и регламент загрузки

Документ описывает, откуда и каким запросом берутся JSON-снимки шести
источников экзопланетных данных, а также правила их хранения.

Скрипт: [`scripts/fetch-sources.ps1`](../scripts/fetch-sources.ps1)

```powershell
# все источники
powershell -ExecutionPolicy Bypass -File scripts\fetch-sources.ps1

# только часть
powershell -ExecutionPolicy Bypass -File scripts\fetch-sources.ps1 -Sources nasa,gaia

# свой каталог
powershell -ExecutionPolicy Bypass -File scripts\fetch-sources.ps1 -OutDir D:\planet-data
```

---

## Общий принцип TAP

Пять из шести источников работают по протоколу IVOA TAP и принимают один и
тот же GET-запрос:

```
<base>/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=<ADQL, url-encoded>
```

Кодировать вручную не нужно — используйте `curl -G --data-urlencode "QUERY=..."`.

**Главная проверка:** если тело ответа начинается с `<VOTABLE` — это ошибка,
даже когда HTTP-код равен 200. Валидность определяется только парсингом JSON.

---

## 1. NASA Exoplanet Archive

```
GET https://exoplanetarchive.ipac.caltech.edu/TAP/sync
```

```sql
select pl_name,hostname,disc_year,discoverymethod,pl_orbper,pl_orbsmax,
       pl_orbeccen,pl_rade,pl_bmasse,pl_dens,pl_eqt,pl_insol,sy_snum,sy_pnum,
       st_spectype,st_teff,st_rad,st_mass,st_lum,st_met,sy_dist,ra,dec
from pscomppars
```

| Параметр | Значение |
|---|---|
| Формат ответа | массив объектов, поля именованы |
| Объём (14.11.2026) | 6 470 строк, 3.19 МБ |
| Таблица | `pscomppars` — все подтверждённые планеты, одна строка на планету |

---

## 2. Exoplanet.eu

```
GET http://voparis-tap-planeto.obspm.fr/tap/sync
```

```sql
select target_name,alt_target_name,star_name,radius,mass,period,semi_major_axis,
       eccentricity,temp_calculated,temp_measured,star_teff,star_radius,
       star_mass,star_metallicity,star_distance,star_spec_type,ra,dec,
       discovered,updated,detection_type,mass_detection_type,
       radius_detection_type
from exoplanet.epn_core
```

| Параметр | Значение |
|---|---|
| Формат ответа | `{contains, params, columns[], data[[...]]}` — строки массивами |
| Объём | 8 477 строк, 1.99 МБ |
| Особенность | **только `http://`** — по HTTPS хост не отвечает |

Имя планеты хранится в `target_name`; колонки `name` не существует.

---

## 3. Exo-MerCat

```
GET http://archives.ia2.inaf.it/vo/tap/projects/sync
```

```sql
select exomercat_name,nasa_name,toi_name,eu_name,host,main_id,main_id_ra,
       main_id_dec,mass,mass_min,mass_max,msini,msini_min,msini_max,bestmass,
       bestmass_min,bestmass_max,bestmass_provenance,bestmass_url,p,p_min,p_max,
       r,r_min,r_max,a,a_min,a_max,e,e_min,e_max,i,discovery_method,status,
       confirmed,discovery_year,main_id_aliases
from exomercat.exomercat
```

| Параметр | Значение |
|---|---|
| Формат ответа | `{metadata[], data[[...]]}` — строки массивами |
| Объём | 17 617 строк, 4.89 МБ |
| Таймаут | 900 с: сервер отдаёт данные очень медленно |
| Официальный TAP | `http://archives.ia2.inaf.it/vo/tap/projects/` |

**Ловушки:**

- `select *` не работает — сервер возвращает `java.lang.InterruptedException`
  и обрывает ответ примерно на 300-й секунде. Только явный список колонок.
- `catalog` — зарезервированное слово ADQL. Либо `"catalog"` в кавычках,
  либо исключить из запроса.

---

## 4. Gaia DR3

```
GET https://gea.esac.esa.int/tap-server/tap/sync
```

```sql
select top 2000 g.source_id,g.ra,g.dec,g.parallax,g.parallax_error,g.pmra,
       g.pmdec,g.phot_g_mean_mag,g.bp_rp,g.ruwe,
       a.teff_gspphot,a.radius_gspphot,a.mass_flame
from gaiadr3.gaia_source as g
join gaiadr3.astrophysical_parameters as a on g.source_id = a.source_id
where g.parallax > 0 and g.ruwe < 1.4
```

| Параметр | Значение |
|---|---|
| Формат ответа | `{metadata[], data[[...]]}` |
| Объём | 2 000 строк, 346 КБ |
| Ограничение | весь DR3 (1.8 млрд источников) одной выгрузкой не отдаётся |

**Ловушки:**

- `radius_gspphot`, `lum_gspphot`, `mass_flame` находятся **не** в
  `gaiadr3.gaia_source`, а в `gaiadr3.astrophysical_parameters` — нужен JOIN.
- `lum_gspphot` в этой схеме не резолвится («Unknown column») — не использовать.
- Возможен HTTP 429 — повторить запрос с паузой.

Для приложения выборку Gaia нужно строить не «top N», а по списку
звёзд-хозяев из NASA / Exo-MerCat.

---

## 5. SIMBAD

```
GET https://simbad.cfa.harvard.edu/simbad/sim-tap/sync
```

```sql
select top 5000 main_id,ra,dec,otype_txt,sp_type,plx_value,pmra,pmdec
from basic where ra is not null
```

| Параметр | Значение |
|---|---|
| Формат ответа | `{metadata[], data[[...]]}` |
| Объём | 5 000 строк, 417 КБ |
| Особенность | `simbad.cds.unistra.fr` недоступен — использовать зеркало `simbad.cfa.harvard.edu` |

---

## 6. Exo.MAST (per-planet)

```
GET https://exo.mast.stsci.edu/api/v0.1/exoplanets/<название, url-encoded>/properties/
Заголовок: Accept: application/json
```

Пример:

```
https://exo.mast.stsci.edu/api/v0.1/exoplanets/WASP-39%20b/properties/
```

| Параметр | Значение |
|---|---|
| Формат ответа | массив объектов (2–6 блоков на планету) |
| Массовая выгрузка | отсутствует — только по одной планете |
| Пауза между запросами | 250 мс |

По умолчанию скрипт качает 10 планет: Proxima Centauri b, TRAPPIST-1 e,
Kepler-452 b, TOI-700 d, WASP-39 b, 55 Cnc e, GJ 1214 b, K2-18 b,
HD 209458 b, Kepler-186 f.

В приложении этот источник **не опрашивается при старте**: запрос выполняется
лениво при приближении к конкретной планете.

---

## Валидация

```
1. Прочитать тело ответа.
2. Если TrimStart().StartsWith("<VOTABLE")  -> ошибка, latest.json не перезаписывать.
3. Распарсить JSON.
4. Посчитать записи: top-level array -> Count, .data -> Count, .properties -> Count.
5. При ошибке сохранить предыдущий latest.json и записать error в manifest.json.
```

---

## Структура хранения

```
data/backups/<source>/latest.json             последний успешный ответ (raw)
data/backups/<source>/<YYYYMMDD_HHMMSS>.json  версия для отката
data/backups/<source>/latest.objects.json     TAP: массив объектов вместо массивов
data/backups/exomast/<slug>.json              ответ по конкретной планете
data/backups/exomast/index.json               список скачанных планет
data/backups/manifest.json                    сводка: url, bytes, records, versions
```

Нормализация TAP: имена колонок берутся из `metadata[].name`
(у Exoplanet.eu — из `columns[].name`) и сшиваются с каждым массивом `data[i]`
по индексу.

Каталог `data/backups/` исключён из git: это воспроизводимые артефакты,
которые растут на ~11 МБ при каждом обновлении.

---

## Тайминги (14.11.2026)

| Источник | Время |
|---|---|
| NASA | ~2 с |
| Exoplanet.eu | ~3 с |
| Gaia | ~5 с |
| SIMBAD | ~2 с |
| Exo.MAST (10 планет) | ~5 с |
| Exo-MerCat | 2–15 мин |

Exo-MerCat запускать последним и с отдельным таймаутом.

---

## Чек-лист ловушек

| Симптом | Решение |
|---|---|
| `<VOTABLE>` при HTTP 200 | проверять тело, а не статус |
| Exoplanet.eu: connection failed | только `http://` |
| Exo-MerCat: `java.lang.InterruptedException` | явный список колонок вместо `select *` |
| ADQL: `Encountered "catalog"` | кавычки `"catalog"` или убрать колонку |
| Gaia: `unresolved identifiers: radius_gspphot` | JOIN с `astrophysical_parameters` |
| Gaia: `Unknown column "a.lum_gspphot"` | не запрашивать `lum_gspphot` |
| SIMBAD CDS недоступен | зеркало `simbad.cfa.harvard.edu` |
| Exo.MAST медленно/лимиты | не опрашивать при старте, только per-planet |
| TAP вернул массивы вместо объектов | нормализовать по `metadata[].name` |
