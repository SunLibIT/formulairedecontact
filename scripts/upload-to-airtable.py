# -*- coding: utf-8 -*-
"""
Charge les demandes de contact reparees vers Airtable.

Prerequis :
  1. python scripts/repair-xlsx.py <chemin-du-xlsx>   -> produit records.json
  2. un token Airtable (PAT) avec les scopes data.records:read + data.records:write
     sur la base "Simulateur Solaire" : https://airtable.com/create/tokens

Usage :
  AIRTABLE_TOKEN=patXXXX python scripts/upload-to-airtable.py [records.json]
  AIRTABLE_TOKEN=patXXXX python scripts/upload-to-airtable.py --dry-run

Idempotent : upsert sur le champ "Response ID". Relancer le script ne cree
pas de doublon, il met a jour les enregistrements existants.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE_ID = "appYjCP9BUY8Zj5Ni"          # Simulateur Solaire
TABLE_ID = "tblcgBrFfVCBrczdl"         # Demandes de contact
MERGE_ON = "fld2EHfUcopGI4FzO"         # Response ID

# nom logique -> id de champ Airtable
FIELD_ID = {
    "Response ID": "fld2EHfUcopGI4FzO",
    "Form ID": "fldV3UrrOh3BgL6OW",
    "Date soumission": "fldTeBIok4t5SzchH",
    "Nom": "fldJsJt1mbsDzllwp",
    "Prénom": "fldi2fllcOjhkdnez",
    "Email": "fldrwQjAaZVAqgqrH",
    "Téléphone": "fld7719at95masMxZ",
    "Entreprise": "fldbvUdmsqD5fQKwX",
    "Vous êtes": "fld02pk6STDA7s6Vx",
    "Motif": "fldW2YL0mDOt9we64",
    "Message": "fld5XFRNvY4ujHWVc",
    "Adresse": "fldhcCA8eAcwBcpDT",
    "Complément d'adresse": "fld9mIzjniYLw7SQn",
    "Ville": "fldRJCOMCIJt32nGT",
    "Code postal": "fldbzJLzPQEqM2q6t",
    "Département": "fldO9LPuTO0PRIPt6",
    "Région": "fldZSqh21vXrfsBq4",
    "Pays": "fldGhnX2PkchpW76f",
    "Statut": "fldZjSSAAZVhcVEeH",
    "Priorité": "fldiFRpsqZWu50Puz",
    "Partenaire": "fldckAwd6C9Fi6Cdm",
    "Assigné à": "fldzJnDK7zuZ8eExl",
    "Notes": "fldQFmXnHOw4Mk3N1",
}

LINK_FIELDS = {"Assigné à"}   # champs de type lien -> valeur en tableau
BATCH = 10                    # limite dure de l'API Airtable
SLEEP = 0.25                  # 4 req/s, sous la limite de 5/s par base


def to_fields(rec):
    fields = {}
    for name, fid in FIELD_ID.items():
        v = rec.get(name)
        if v in (None, ""):
            continue
        fields[fid] = [v] if name in LINK_FIELDS else v
    return {"fields": fields}


def _post(token, records, typecast):
    url = "https://api.airtable.com/v0/%s/%s" % (BASE_ID, TABLE_ID)
    payload = {
        "performUpsert": {"fieldsToMergeOn": [MERGE_ON]},
        "records": records,
        "typecast": typecast,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="PATCH")
    req.add_header("Authorization", "Bearer %s" % token)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def upsert(token, records, dry_run=False):
    """Ecrit un lot. Strict par defaut.

    Repli : si une option de liste deroulante n'existe pas encore dans la table
    (INVALID_MULTIPLE_CHOICE_OPTIONS), on rejoue le lot avec typecast pour la
    creer. Le repli est volontairement limite a ce cas precis : ailleurs,
    typecast masquerait des erreurs de donnees au lieu de les signaler.
    """
    if dry_run:
        return {"createdRecords": [], "updatedRecords": [], "records": records}
    try:
        return _post(token, records, False)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        if "INVALID_MULTIPLE_CHOICE_OPTIONS" not in detail:
            raise SystemExit("Erreur Airtable %s : %s" % (e.code, detail))
        print("      option de liste absente -> rejeu du lot avec typecast")
        try:
            return _post(token, records, True)
        except urllib.error.HTTPError as e2:
            raise SystemExit("Erreur Airtable %s : %s"
                             % (e2.code, e2.read().decode("utf-8", "replace")))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv

    token = os.environ.get("AIRTABLE_TOKEN", "")
    if not token and not dry_run:
        raise SystemExit(
            "AIRTABLE_TOKEN manquant.\n"
            "  Cree un token sur https://airtable.com/create/tokens\n"
            "  scopes : data.records:read + data.records:write\n"
            "  base   : Simulateur Solaire\n"
            "  puis   : AIRTABLE_TOKEN=patXXXX python scripts/upload-to-airtable.py"
        )

    path = args[0] if args else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "records.json")
    if not os.path.exists(path):
        raise SystemExit(
            "Fichier introuvable : %s\n"
            "  Lance d'abord : python scripts/repair-xlsx.py <chemin-du-xlsx>" % path)

    with open(path, encoding="utf-8") as f:
        records = json.load(f)

    print("Source      : %s" % path)
    print("A charger   : %d enregistrements" % len(records))
    print("Destination : %s / %s" % (BASE_ID, TABLE_ID))
    print("Mode        : %s" % ("SIMULATION (aucune ecriture)" if dry_run else "ECRITURE"))
    print("")

    created = updated = 0
    for i in range(0, len(records), BATCH):
        chunk = [to_fields(r) for r in records[i:i + BATCH]]
        res = upsert(token, chunk, dry_run)
        created += len(res.get("createdRecords", []))
        updated += len(res.get("updatedRecords", []))
        done = min(i + BATCH, len(records))
        print("  %3d/%d  crees=%d  maj=%d" % (done, len(records), created, updated))
        if not dry_run and done < len(records):
            time.sleep(SLEEP)

    print("")
    if dry_run:
        print("Simulation terminee : %d enregistrements valides, rien n'a ete ecrit." % len(records))
    else:
        print("Termine : %d crees, %d mis a jour." % (created, updated))


if __name__ == "__main__":
    main()
