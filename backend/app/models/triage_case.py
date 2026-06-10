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


class Presentation(_Strict):
    chiefComplaint: str
    history: History = Field(default_factory=History)
    groundTruthVitals: Vitals = Field(default_factory=Vitals)


class ExpertLabels(_Strict):
    """Hidden from the client until the encounter reaches FEEDBACK."""

    esi: int = Field(ge=1, le=5, description="Reference ESI acuity (1 = most acute).")
    esiRationale: str | None = None
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
    provenance: Provenance
