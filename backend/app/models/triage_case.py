"""TriageCase models — mirrors shared/schemas/triage-case.schema.json."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class Sex(str, Enum):
    male = "male"
    female = "female"
    other = "other"
    unknown = "unknown"


class CriticalIntervention(str, Enum):
    IV_ACCESS = "IV_ACCESS"
    OXYGEN = "OXYGEN"
    ECG = "ECG"
    CARDIAC_MONITOR = "CARDIAC_MONITOR"
    FLUID_BOLUS = "FLUID_BOLUS"
    GLUCOSE_CHECK = "GLUCOSE_CHECK"
    NEURO_CHECK = "NEURO_CHECK"
    IMMOBILIZATION = "IMMOBILIZATION"
    ANALGESIA = "ANALGESIA"
    ANTIBIOTICS = "ANTIBIOTICS"
    AIRWAY_MANAGEMENT = "AIRWAY_MANAGEMENT"
    NONE = "NONE"


class Disposition(str, Enum):
    DISCHARGE = "DISCHARGE"
    ADMIT = "ADMIT"
    ICU = "ICU"
    OR = "OR"
    EXPIRED = "EXPIRED"
    TRANSFER = "TRANSFER"
    LWBS = "LWBS"
    UNKNOWN = "UNKNOWN"


class AVPU(str, Enum):
    A = "A"
    V = "V"
    P = "P"
    U = "U"


class Difficulty(str, Enum):
    """Pedagogical difficulty tag. TRAP = benign-looking-but-dangerous."""

    STANDARD = "STANDARD"
    TRAP = "TRAP"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Vitals(_Strict):
    """Triage vitals. None means 'not measured'; the schema allows null per field."""

    heartRate: float | None = None
    systolicBP: float | None = None
    diastolicBP: float | None = None
    respiratoryRate: float | None = None
    spo2: float | None = None
    temperatureC: float | None = None
    painScore: int | None = Field(default=None, ge=0, le=10)
    glucose: float | None = None
    avpu: AVPU | None = None


class Demographics(_Strict):
    ageBand: str = Field(description="De-identified age band, e.g. '25-34'. Never an exact age.")
    sex: Sex


class RedFlagConcept(BaseModel):
    """Concept keywords for one red flag, enabling synonym/anchor matching.

    A flag with a concept is surfaced when an *anchor* token appears AND (if the
    ``any`` synonym list is non-empty) at least one ``any`` token appears — both
    matched as whole tokens against the trainee transcript, so a paraphrased
    clinical question scores instead of requiring the flag's literal words.

    ``any`` is a Python builtin, so the attribute is ``any_`` with alias ``any``.
    ``populate_by_name`` accepts either spelling on input; ``serialize_by_alias``
    emits ``any`` on dump so the wire shape matches the schema.
    """

    model_config = ConfigDict(
        extra="forbid", populate_by_name=True, serialize_by_alias=True
    )

    flag: str = Field(description="Must equal one of the case's redFlags labels.")
    anchors: list[str] = Field(
        default_factory=list,
        description="Core action/sensation tokens; at least one must appear (whole-token).",
    )
    any_: list[str] = Field(
        default_factory=list,
        alias="any",
        description="Optional synonyms; if non-empty, at least one must appear (whole-token).",
    )


class History(_Strict):
    hpi: str | None = None
    pmh: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    socialHistory: str | None = None
    redFlags: list[str] = Field(
        default_factory=list,
        description="Critical findings a competent history surfaces; scored under completeness.",
    )
    redFlagConcepts: list[RedFlagConcept] = Field(
        default_factory=list,
        description="Optional concept keywords per red flag (anchors + synonyms).",
    )


class Presentation(_Strict):
    chiefComplaint: str
    history: History = Field(default_factory=History)
    groundTruthVitals: Vitals = Field(default_factory=Vitals)


class ExpertLabels(_Strict):
    """Hidden from the client until the encounter reaches FEEDBACK."""

    esi: int = Field(ge=1, le=5, description="Reference ESI acuity (1 = most acute).")
    esiRationale: str | None = None
    requiresLifeSaving: bool = Field(
        default=False, description="ESI step A: needs an immediate life-saving intervention."
    )
    isHighRisk: bool = Field(
        default=False, description="ESI step B: high-risk situation / should not wait."
    )
    criticalInterventions: list[CriticalIntervention] = Field(default_factory=list)
    resourcesPredicted: int | None = Field(default=None, ge=0)


class Outcome(_Strict):
    disposition: Disposition | None = None
    edLengthOfStayMinutes: int | None = Field(default=None, ge=0)
    diagnosisCategories: list[str] = Field(default_factory=list)


class Provenance(_Strict):
    license: str
    deidentified: bool = Field(description="Must be true. Loaders reject false.")
    sourceRef: str | None = None


class TriageCase(_Strict):
    """A de-identified ED presentation a trainee will triage.

    Every data source normalizes to this. `expert` and `presentation.history`
    detail stay server-side until the encounter reaches FEEDBACK.
    """

    caseId: str
    source: str = Field(description="mimic_demo | synthetic | mimic_full | mietic")
    demographics: Demographics
    presentation: Presentation
    expert: ExpertLabels
    outcome: Outcome | None = None
    gradableDimensions: list[str] | None = Field(
        default=None,
        description=(
            "If set, only these scoring dimensions are graded and weighted; others "
            "are excluded from normalization. None = grade all dimensions (synthetic "
            "default). Used for sources like MIMIC that lack curated red-flags/interventions."
        ),
    )
    difficulty: Difficulty | None = Field(
        default=None,
        description=(
            "Pedagogical difficulty. TRAP = benign-looking presentation with a "
            "dangerous diagnosis (high under-triage risk). None/absent = standard. "
            "Server-side only: TriageCase never crosses to the client."
        ),
    )
    provenance: Provenance
