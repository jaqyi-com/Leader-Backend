#!/usr/bin/env python3
"""
Builds src/counts/phoneGeo.json.gz: the place named by a landline's area code, for every country
except India and the USA (the only data the city fill needs).

Source: Google's libphonenumber geocoding data, via the Python package `phonenumbers`
(pip install phonenumbers). Each entry maps a number prefix (country code + area code digits) to
[English place] or [English place, local-language place] ("München" for Munich).

Run only to update the data (e.g. after a phonenumbers release); the app reads the .gz file.
Usage: python3 scripts/build_phone_geo.py
"""
import gzip, json, os
import phonenumbers
from phonenumbers.geodata import GEOCODE_DATA
from phonenumbers import region_codes_for_country_code, region_code_for_number

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "counts", "phoneGeo.json.gz")
# Keep in sync with LOCAL_LANG in src/counts/fillCities.js.
LOCAL_LANG = {"DE": "de", "AT": "de", "CH": "de", "FR": "fr", "BE": "fr", "LU": "fr", "IT": "it", "ES": "es",
              "MX": "es", "AR": "es", "CL": "es", "CO": "es", "PE": "es", "NL": "nl", "PL": "pl", "SE": "sv",
              "BR": "pt", "PT": "pt", "RU": "ru", "JP": "ja", "CZ": "cs", "FI": "fi", "NO": "no", "DK": "da",
              "GR": "el", "TR": "tr", "RO": "ro", "HU": "hu", "KR": "ko", "CN": "zh", "TW": "zh"}


def calling_code(prefix):
    for length in (1, 2, 3):
        regions = region_codes_for_country_code(int(prefix[:length]))
        if regions and regions != ("ZZ",):
            return int(prefix[:length])
    return None


_nanp = {}
def nanp_region(area):
    """Region of a +1 area code (CA, PR, JM, …, or US)."""
    if area not in _nanp:
        _nanp[area] = None
        for tail in ("2345678", "5550123", "2001234", "3456789"):
            region = region_code_for_number(phonenumbers.parse("+1" + area + tail, None))
            if region:
                _nanp[area] = region
                break
    return _nanp[area]


def main():
    out = {}
    for prefix, langs in GEOCODE_DATA.items():
        cc = calling_code(prefix)
        if cc is None or cc == 91:
            continue
        if cc == 1:
            if len(prefix) < 4 or nanp_region(prefix[1:4]) in (None, "US"):
                continue
            region = nanp_region(prefix[1:4])
        else:
            region = region_codes_for_country_code(cc)[0]
        en, local = langs.get("en"), langs.get(LOCAL_LANG.get(region, "en"))
        if not en and not local:
            continue
        out[prefix] = [en or local] if (not local or local == en) else [en, local]
    data = json.dumps({"source": f"libphonenumber via phonenumbers {phonenumbers.__version__}", "prefixes": out},
                      ensure_ascii=False, separators=(",", ":")).encode()
    with gzip.open(OUT, "wb", compresslevel=9) as f:
        f.write(data)
    print(f"{len(out)} prefixes -> {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
