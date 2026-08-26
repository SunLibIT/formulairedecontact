# -*- coding: utf-8 -*-
"""
Reconstruit les demandes de contact depuis l'export xlsx corrompu.

L'export d'origine est en realite deux exports colles bout a bout :
  - lignes 2 a 377   : 376 enregistrements corrects sur 20 colonnes
  - lignes 378 a 529 : un dump CSV brut ecrase dans la seule colonne
                       "ID Reponse", dont les messages multi-lignes ont
                       eclate sur plusieurs lignes du tableur

Ce script reassemble les deux blocs, normalise les formats (dates, telephones,
statuts, priorites, pays), resout les assignations vers les identifiants de la
table RH Airtable, et produit scripts/records.json.

Usage : python scripts/repair-xlsx.py <chemin-du-xlsx>
Puis  : AIRTABLE_TOKEN=patXXXX python scripts/upload-to-airtable.py
"""
import zipfile, re, csv, io, json, sys, os, datetime, collections, unicodedata
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DEFAULT_XLSX = os.path.join(os.path.expanduser("~"), "Downloads", "typeform_responses.xlsx")
XLSX = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# Nom du collaborateur -> id d'enregistrement dans la table RH (tblySHLLDvHjk2ktK)
RH = {
    "ilan levy": "recC4WVeIPyCJOkj7", "edouard da silva": "rec6reoyQfLubcOEj",
    "philippe gery": "recF1QqSjZ0adTEHI", "guillaume ozanic": "recmfnJtomc8He8E2",
    "frederic huet": "recEKudjHWsT6uQku", "julien ramon": "recFqCvwhGmVCpP4W",
    "antoine kelbert": "recI1SYyKyjFdvuEv", "alexandre dugois": "recIySsw4gecDVh5P",
    "fabrice morvan": "reckWjmQ0iScF9zfx", "guillaume niggli": "recfEVFWeHGJ53pWk",
    "philippe": "recMtfS2XxleN8eNw", "karine romano": "recqnZe4k776702V5",
    "karine": "recnFWEEZOVeGlCsD",
}
# libelles du fichier (bloc 1) et codes internes (bloc 2) -> cle normalisee
STATUT = {
    "nouveau": "Nouveau", "a contacter": "A contacter", "qualifie": "Qualifie",
    "a relancer": "A relancer", "hors criteres": "Hors Criteres", "archive": "Archive",
    "new": "Nouveau", "to_contact": "A contacter", "qualified": "Qualifie",
    "to_relaunch": "A relancer", "out_of_criteria": "Hors Criteres",
}
# cle normalisee -> libelle exact de l'option Airtable
STATUT_AT = {
    "Nouveau": "Nouveau", "A contacter": "A contacter", "Qualifie": "Qualifié",
    "A relancer": "A relancer", "Hors Criteres": "Hors Critères",
    "Archive": "Archivé",
}
PRIO = {"basse": "Basse", "moyenne": "Moyenne", "haute": "Haute",
        "low": "Basse", "medium": "Moyenne", "high": "Haute"}
FORM = {"MtEfRiYk": "MtEfRiYk (V0)", "gbPj3B1m": "gbPj3B1m (MAR26)"}


def key(s):
    """Minuscule sans accents, pour comparer des libelles saisis a la main."""
    s = (s or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def read_sheet(z, name):
    root = ET.fromstring(z.read(name))
    rows = []

    def colnum(ref):
        n = 0
        for ch in re.match(r"([A-Z]+)", ref).group(1):
            n = n * 26 + ord(ch) - 64
        return n - 1

    for r in root.iter(NS + "row"):
        cells = {}
        for c in r.findall(NS + "c"):
            t = c.get("t")
            v = c.find(NS + "v")
            isel = c.find(NS + "is")
            if t == "inlineStr" and isel is not None:
                val = "".join(x.text or "" for x in isel.iter(NS + "t"))
            else:
                val = v.text if v is not None else ""
            cells[colnum(c.get("r"))] = val
        if cells:
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
    return rows


def phone(p):
    """Normalise en E.164. Retire l'apostrophe d'import Excel."""
    p = (p or "").strip().lstrip("'").replace(" ", "").replace(".", "").replace("-", "")
    if not p:
        return ""
    if p.startswith("+"):
        return p
    if p.startswith("33") and len(p) >= 11:
        return "+" + p
    if p.startswith("0") and len(p) == 10:
        return "+33" + p[1:]
    return p


def serial_to_iso(s):
    """Numero de serie Excel -> ISO 8601. Epoque au 30/12/1899."""
    try:
        d = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(s))
        return d.replace(microsecond=0).isoformat() + "Z"
    except Exception:
        return None


def pg_to_iso(s):
    m = re.match(r"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})", (s or "").strip())
    return m.group(1) + "T" + m.group(2) + "Z" if m else None


def country(c):
    c = (c or "").strip()
    return "France" if c.upper() in ("FR", "FRA", "FRANCE") else c


if not os.path.exists(XLSX):
    raise SystemExit("Fichier introuvable : %s\nUsage : python scripts/repair-xlsx.py <chemin-du-xlsx>" % XLSX)

z = zipfile.ZipFile(XLSX)
rows = read_sheet(z, "xl/worksheets/sheet1.xml")
hdr, data = rows[0], rows[1:]
H = {h: i for i, h in enumerate(hdr)}
IDX = H["ID Réponse"]

records = []
warn = collections.Counter()


def g(r, name):
    i = H.get(name)
    return (r[i].strip() if i is not None and i < len(r) else "")


# ---- Bloc 1 : lignes structurees, jusqu'a la premiere ligne CSV brute ----
RECLINE = re.compile(r"^[a-z0-9]{32},(gbPj3B1m|MtEfRiYk),")
split_at = next((i for i, r in enumerate(data)
                 if RECLINE.match(r[IDX] if IDX < len(r) else "")), len(data))

for r in data[:split_at]:
    rid = g(r, "ID Réponse")
    if not re.fullmatch(r"[a-z0-9]{32}", rid):
        warn["bloc1: Response ID malforme"] += 1
        continue
    raw_st = g(r, "Statut")
    st = STATUT.get(key(raw_st), "")
    if raw_st and not st:
        warn["statut inconnu: " + raw_st] += 1
    raw_as = g(r, "Assigné à")
    rh = RH.get(key(raw_as))
    if raw_as and not rh:
        warn["RH introuvable: " + raw_as] += 1
    d = serial_to_iso(g(r, "Date soumission"))
    if g(r, "Date soumission") and not d:
        warn["bloc1: date illisible"] += 1
    records.append({
        "Response ID": rid,
        "Form ID": None,          # absent de l'export : a completer via l'API Typeform
        "Date soumission": d,
        "Nom": g(r, "Nom"),
        "Prénom": g(r, "Prénom"),
        "Email": g(r, "Email"),
        "Téléphone": phone(g(r, "Téléphone")),
        "Entreprise": g(r, "Entreprise"),
        "Vous êtes": g(r, "Type demandeur"),
        "Motif": g(r, "Motif"),
        "Message": g(r, "Message"),
        "Adresse": g(r, "Adresse"),
        "Complément d'adresse": "",
        "Ville": g(r, "Ville"),
        "Code postal": g(r, "Code postal"),
        "Département": g(r, "Département"),
        "Région": "",
        "Pays": country(g(r, "Pays")),
        "Statut": STATUT_AT.get(st, "Nouveau"),
        "Priorité": PRIO.get(key(g(r, "Priorité")), "Moyenne"),
        "Partenaire": g(r, "Partenaire"),
        "Assigné à": rh,
        "Notes": g(r, "Notes"),
    })

# ---- Bloc 2 : reassemblage des lignes CSV eclatees ----
# Une ligne qui matche RECLINE ouvre un enregistrement ; les suivantes sont
# la continuation d'un champ multi-ligne (message) et sont recollees avec \n.
blobs, cur = [], None
for r in data[split_at:]:
    s = r[IDX] if IDX < len(r) else ""
    if RECLINE.match(s):
        if cur is not None:
            blobs.append(cur)
        cur = s
    elif cur is not None:
        cur += "\n" + s
    else:
        warn["bloc2: fragment orphelin"] += 1
if cur is not None:
    blobs.append(cur)

COLS = ["response_id", "form_id", "submitted_at", "created_at", "updated_at", "nom",
        "prenom", "email", "telephone", "entreprise", "requester_type", "motif",
        "address", "address_line2", "city", "state_region", "postal_code", "department",
        "country", "message", "status", "priority", "partner", "assigned_to", "notes"]

for blob in blobs:
    parsed = next(csv.reader(io.StringIO(blob)), None)
    if not parsed:
        warn["bloc2: CSV illisible"] += 1
        continue
    if len(parsed) < len(COLS):
        parsed += [""] * (len(COLS) - len(parsed))
    v = dict(zip(COLS, parsed))
    raw_as = v["assigned_to"]
    rh = RH.get(key(raw_as))
    if raw_as and not rh:
        warn["RH introuvable: " + raw_as] += 1
    records.append({
        "Response ID": v["response_id"],
        "Form ID": FORM.get(v["form_id"]),
        "Date soumission": pg_to_iso(v["submitted_at"]),
        "Nom": v["nom"],
        "Prénom": v["prenom"],
        "Email": v["email"],
        "Téléphone": phone(v["telephone"]),
        "Entreprise": v["entreprise"],
        "Vous êtes": v["requester_type"],
        "Motif": v["motif"],
        "Message": v["message"],
        "Adresse": v["address"],
        "Complément d'adresse": v["address_line2"],
        "Ville": v["city"],
        "Code postal": v["postal_code"],
        "Département": v["department"],
        "Région": v["state_region"],
        "Pays": country(v["country"]),
        "Statut": STATUT_AT.get(STATUT.get(key(v["status"]), "Nouveau"), "Nouveau"),
        "Priorité": PRIO.get(key(v["priority"]), "Moyenne"),
        "Partenaire": v["partner"],
        "Assigné à": rh,
        "Notes": v["notes"],
    })

# ---- Controles ----
ids = [r["Response ID"] for r in records]
dups = [i for i, n in collections.Counter(ids).items() if n > 1]
print("Source                      : %s" % XLSX)
print("Bascule bloc1 / bloc2       : ligne %d" % (split_at + 2))
print("Enregistrements reconstruits: %d" % len(records))
print("Response ID uniques         : %d   doublons : %d" % (len(set(ids)), len(dups)))
print("Blobs bloc2 reassembles     : %d" % len(blobs))
print("Response ID malformes       : %d" % sum(
    1 for r in records if not re.fullmatch(r"[a-z0-9]{32}", r["Response ID"])))
print("Sans date de soumission     : %d" % sum(1 for r in records if not r["Date soumission"]))
msgs = [r for r in records if r["Message"].strip()]
print("Avec message                : %d  (multi-lignes : %d)" % (
    len(msgs), sum(1 for r in msgs if "\n" in r["Message"])))
print("Assignation RH resolue      : %d" % sum(1 for r in records if r["Assigné à"]))
print("Avec email                  : %d" % sum(1 for r in records if r["Email"].strip()))
print("")
print("Statuts   :", dict(collections.Counter(r["Statut"] for r in records)))
print("Priorites :", dict(collections.Counter(r["Priorité"] for r in records)))
print("Form ID   :", dict(collections.Counter(str(r["Form ID"]) for r in records)))
print("")
if warn:
    print("Avertissements :")
    for k, n in warn.most_common():
        print("   %4d  %s" % (n, k))
else:
    print("Avertissements : aucun")

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "records.json")
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=1)
print("")
print("Ecrit : %s" % OUT)
