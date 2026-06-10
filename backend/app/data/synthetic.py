"""Synthetic case source.

Two complementary parts, both fully offline and deterministic:

1. **Hand-authored seed cases** under
   ``backend/data/sources/synthetic/seed/*.json`` — high-quality, clinically
   reviewed ED presentations spanning ESI 1..5. These are the canonical
   examples reviewers check for label plausibility.

2. **A deterministic generator** (``generate_cases``) seeded with a fixed value
   so the produced set is byte-for-byte reproducible across runs (no network,
   no wall-clock, no unseeded RNG). It expands the templates into a diverse but
   plausible set with red flags, vitals, expert labels and some outcomes.

``load()`` returns the seed cases followed by the generated cases.
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass, field

from app.data import SOURCES_DIR
from app.models import TriageCase

#: Fixed seed so the generator is reproducible. Tests assert determinism.
GENERATOR_SEED = 20260609

_SEED_DIR = SOURCES_DIR / "synthetic" / "seed"


@dataclass(frozen=True)
class _VitalRange:
    """Inclusive integer range a vital is jittered within (deterministically)."""

    low: int
    high: int

    def pick(self, rng: random.Random) -> int:
        return rng.randint(self.low, self.high)


@dataclass(frozen=True)
class _Template:
    """A clinical archetype the generator expands into concrete cases."""

    slug: str
    chief_complaint: str
    age_bands: tuple[str, ...]
    sexes: tuple[str, ...]
    esi: int
    esi_rationale: str
    hpi: str
    pmh: tuple[str, ...]
    medications: tuple[str, ...]
    allergies: tuple[str, ...]
    red_flags: tuple[str, ...]
    critical_interventions: tuple[str, ...]
    resources_predicted: int
    hr: _VitalRange
    sbp: _VitalRange
    dbp: _VitalRange
    rr: _VitalRange
    spo2: _VitalRange
    temp_x10: _VitalRange  # temperature in tenths of a degree C, to keep RNG integral
    pain: _VitalRange
    glucose: _VitalRange
    avpu: str
    dispositions: tuple[str, ...] = field(default=())
    diagnosis_categories: tuple[str, ...] = field(default=())


# A diverse, clinically-plausible set of archetypes spanning all five ESI levels.
_TEMPLATES: tuple[_Template, ...] = (
    _Template(
        slug="anaphylaxis",
        chief_complaint="Sudden hives, swelling, and difficulty breathing after exposure",
        age_bands=("18-24", "25-34", "35-44"),
        sexes=("female", "male"),
        esi=1,
        esi_rationale=(
            "Anaphylaxis with airway/hemodynamic compromise needs immediate "
            "intramuscular epinephrine and resuscitation. ESI 1."
        ),
        hpi=(
            "Rapid onset of diffuse urticaria, lip/tongue swelling, wheeze and "
            "light-headedness minutes after allergen exposure."
        ),
        pmh=("Atopy",),
        medications=("Antihistamine PRN",),
        allergies=("Multiple food allergens",),
        red_flags=(
            "Airway compromise (lip/tongue swelling, stridor)",
            "Hypotension / pre-syncope",
            "Multi-system involvement (skin + respiratory)",
        ),
        critical_interventions=("AIRWAY_MANAGEMENT", "OXYGEN", "IV_ACCESS", "FLUID_BOLUS"),
        resources_predicted=5,
        hr=_VitalRange(120, 140),
        sbp=_VitalRange(78, 92),
        dbp=_VitalRange(44, 56),
        rr=_VitalRange(28, 34),
        spo2=_VitalRange(85, 90),
        temp_x10=_VitalRange(365, 372),
        pain=_VitalRange(1, 3),
        glucose=_VitalRange(95, 130),
        avpu="A",
        dispositions=("ICU", "ADMIT"),
        diagnosis_categories=("Anaphylaxis",),
    ),
    _Template(
        slug="stemi",
        chief_complaint="Crushing chest pressure radiating to the arm with sweating",
        age_bands=("45-54", "55-64", "65-74"),
        sexes=("male", "female"),
        esi=2,
        esi_rationale=(
            "High-risk chest pain concerning for acute coronary syndrome. "
            "Hemodynamically stable but time-critical; ESI 2."
        ),
        hpi=(
            "Substernal pressure radiating to the left arm and jaw with "
            "diaphoresis and nausea, not relieved by rest."
        ),
        pmh=("Hypertension", "Hyperlipidemia"),
        medications=("Lisinopril", "Atorvastatin"),
        allergies=("None known",),
        red_flags=(
            "Crushing chest pain radiating to arm/jaw with diaphoresis",
            "Time-critical: door-to-ECG within 10 minutes",
        ),
        critical_interventions=("ECG", "CARDIAC_MONITOR", "IV_ACCESS", "ANALGESIA"),
        resources_predicted=5,
        hr=_VitalRange(92, 110),
        sbp=_VitalRange(140, 168),
        dbp=_VitalRange(84, 98),
        rr=_VitalRange(18, 24),
        spo2=_VitalRange(92, 96),
        temp_x10=_VitalRange(364, 372),
        pain=_VitalRange(7, 10),
        glucose=_VitalRange(110, 160),
        avpu="A",
        dispositions=("ADMIT", "OR", "ICU"),
        diagnosis_categories=("Acute coronary syndrome",),
    ),
    _Template(
        slug="sepsis",
        chief_complaint="Fever, weakness, and new confusion for a couple of days",
        age_bands=("65-74", "75-84", "85+"),
        sexes=("male", "female"),
        esi=2,
        esi_rationale=(
            "Septic shock physiology with altered mental status; time-critical "
            "for the sepsis bundle but not yet needing a door-side procedure. ESI 2."
        ),
        hpi=(
            "Several days of fevers and rigors with a suspected source, now with "
            "reduced intake, low urine output, and worsening confusion."
        ),
        pmh=("Diabetes", "Chronic kidney disease"),
        medications=("Metformin",),
        allergies=("None known",),
        red_flags=(
            "Sepsis criteria: fever + tachycardia + tachypnea + hypotension",
            "Altered mental status from baseline",
            "Requires early antibiotics and fluids",
        ),
        critical_interventions=("IV_ACCESS", "FLUID_BOLUS", "ANTIBIOTICS", "OXYGEN"),
        resources_predicted=6,
        hr=_VitalRange(110, 125),
        sbp=_VitalRange(84, 96),
        dbp=_VitalRange(48, 58),
        rr=_VitalRange(24, 30),
        spo2=_VitalRange(90, 94),
        temp_x10=_VitalRange(388, 400),
        pain=_VitalRange(2, 5),
        glucose=_VitalRange(150, 220),
        avpu="V",
        dispositions=("ICU", "ADMIT"),
        diagnosis_categories=("Sepsis",),
    ),
    _Template(
        slug="abdominal-pain",
        chief_complaint="Worsening lower abdominal pain with nausea",
        age_bands=("18-24", "25-34", "35-44"),
        sexes=("female", "male"),
        esi=3,
        esi_rationale=(
            "Stable vitals, no high-risk threat, but expected to need multiple "
            "resources (labs, imaging, IV fluids, analgesia). Two-or-more "
            "resources -> ESI 3."
        ),
        hpi=(
            "Migratory abdominal pain now localized and sharp, with nausea, "
            "anorexia and low-grade fever."
        ),
        pmh=("None",),
        medications=("None",),
        allergies=("None known",),
        red_flags=(
            "Peritoneal signs concerning for a surgical abdomen",
            "Needs pregnancy test before imaging where applicable",
        ),
        critical_interventions=("IV_ACCESS", "ANALGESIA"),
        resources_predicted=4,
        hr=_VitalRange(88, 102),
        sbp=_VitalRange(112, 130),
        dbp=_VitalRange(70, 82),
        rr=_VitalRange(16, 20),
        spo2=_VitalRange(97, 100),
        temp_x10=_VitalRange(373, 384),
        pain=_VitalRange(6, 8),
        glucose=_VitalRange(90, 120),
        avpu="A",
        dispositions=("ADMIT", "OR", "DISCHARGE"),
        diagnosis_categories=("Abdominal pain, undifferentiated",),
    ),
    _Template(
        slug="laceration",
        chief_complaint="Cut from a kitchen knife, bleeding controlled with pressure",
        age_bands=("25-34", "35-44", "45-54"),
        sexes=("male", "female"),
        esi=4,
        esi_rationale=(
            "Simple laceration, controlled bleeding, intact neurovascular and "
            "tendon function. One expected resource (repair) -> ESI 4."
        ),
        hpi=(
            "Linear forearm laceration from a household accident, bleeding "
            "controlled, full distal sensation and movement."
        ),
        pmh=("None",),
        medications=("None",),
        allergies=("None known",),
        red_flags=(
            "Confirm distal neurovascular and tendon function intact",
            "Verify tetanus immunization status",
        ),
        critical_interventions=("ANALGESIA",),
        resources_predicted=1,
        hr=_VitalRange(70, 84),
        sbp=_VitalRange(118, 132),
        dbp=_VitalRange(72, 84),
        rr=_VitalRange(14, 18),
        spo2=_VitalRange(98, 100),
        temp_x10=_VitalRange(363, 370),
        pain=_VitalRange(3, 5),
        glucose=_VitalRange(85, 105),
        avpu="A",
        dispositions=("DISCHARGE",),
        diagnosis_categories=("Laceration",),
    ),
    _Template(
        slug="minor-uri",
        chief_complaint="Sore throat and runny nose for a few days, wants to be checked",
        age_bands=("18-24", "25-34", "35-44"),
        sexes=("female", "male"),
        esi=5,
        esi_rationale=(
            "Well-appearing patient with a minor self-limited complaint and "
            "normal vitals. No resources anticipated beyond exam -> ESI 5."
        ),
        hpi=(
            "Several days of sore throat, rhinorrhea and mild cough. Tolerating "
            "fluids, no difficulty breathing or swallowing."
        ),
        pmh=("None",),
        medications=("None",),
        allergies=("None known",),
        red_flags=(
            "Confirm no airway compromise (drooling, tripod, muffled voice)",
        ),
        critical_interventions=("NONE",),
        resources_predicted=0,
        hr=_VitalRange(66, 84),
        sbp=_VitalRange(112, 128),
        dbp=_VitalRange(68, 80),
        rr=_VitalRange(12, 16),
        spo2=_VitalRange(98, 100),
        temp_x10=_VitalRange(367, 380),
        pain=_VitalRange(1, 3),
        glucose=_VitalRange(85, 105),
        avpu="A",
        dispositions=("DISCHARGE",),
        diagnosis_categories=("Upper respiratory infection",),
    ),
)

# How many variants the generator produces per template. Kept small and fixed so
# the output is deterministic and the offline bundle stays lightweight.
_VARIANTS_PER_TEMPLATE = 3


def _build_case(template: _Template, index: int, rng: random.Random) -> TriageCase:
    """Deterministically expand a template into one TriageCase."""
    age_band = template.age_bands[index % len(template.age_bands)]
    sex = template.sexes[index % len(template.sexes)]
    case_id = f"synthetic:gen-{template.slug}-{index:02d}"

    outcome: dict[str, object] | None = None
    if template.dispositions:
        disposition = template.dispositions[index % len(template.dispositions)]
        outcome = {
            "disposition": disposition,
            "edLengthOfStayMinutes": rng.randint(60, 360),
            "diagnosisCategories": list(template.diagnosis_categories),
        }

    payload: dict[str, object] = {
        "caseId": case_id,
        "source": "synthetic",
        "demographics": {"ageBand": age_band, "sex": sex},
        "presentation": {
            "chiefComplaint": template.chief_complaint,
            "history": {
                "hpi": template.hpi,
                "pmh": list(template.pmh),
                "medications": list(template.medications),
                "allergies": list(template.allergies),
                "socialHistory": None,
                "redFlags": list(template.red_flags),
            },
            "groundTruthVitals": {
                "heartRate": float(template.hr.pick(rng)),
                "systolicBP": float(template.sbp.pick(rng)),
                "diastolicBP": float(template.dbp.pick(rng)),
                "respiratoryRate": float(template.rr.pick(rng)),
                "spo2": float(template.spo2.pick(rng)),
                "temperatureC": round(template.temp_x10.pick(rng) / 10.0, 1),
                "painScore": template.pain.pick(rng),
                "glucose": float(template.glucose.pick(rng)),
                "avpu": template.avpu,
            },
        },
        "expert": {
            "esi": template.esi,
            "esiRationale": template.esi_rationale,
            "criticalInterventions": list(template.critical_interventions),
            "resourcesPredicted": template.resources_predicted,
        },
        "outcome": outcome,
        "provenance": {
            "license": "synthetic-generated",
            "deidentified": True,
            "sourceRef": f"synthetic generator seed={GENERATOR_SEED}",
        },
    }
    return TriageCase.model_validate(payload)


def generate_cases(seed: int = GENERATOR_SEED) -> list[TriageCase]:
    """Deterministically generate the synthetic case set.

    The same ``seed`` always yields the same cases (no network, no wall-clock).
    A single seeded RNG is advanced in a fixed traversal order so output is
    byte-for-byte reproducible.
    """
    rng = random.Random(seed)
    cases: list[TriageCase] = []
    for template in _TEMPLATES:
        for variant in range(_VARIANTS_PER_TEMPLATE):
            cases.append(_build_case(template, variant, rng))
    return cases


def load_seed_cases() -> list[TriageCase]:
    """Load the hand-authored seed cases from disk (sorted for stable order)."""
    if not _SEED_DIR.is_dir():
        return []
    cases: list[TriageCase] = []
    for path in sorted(_SEED_DIR.glob("*.json")):
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        cases.append(TriageCase.model_validate(payload))
    return cases


def load() -> list[TriageCase]:
    """Return hand-authored seed cases followed by generated cases."""
    return load_seed_cases() + generate_cases()
