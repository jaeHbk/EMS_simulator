//! Multi-step interventions (intubation, IV/IO access, decompression, etc.)
//! with skill- and environment-modulated success probabilities.
//!
//! Per steering doc §3.2, procedures are themselves simulated as multi-step
//! tasks; a "successful intubation" depends on tube depth, cuff inflation,
//! ETCO2 confirmation, and bilateral breath sounds — not a single dice roll.
//!
//! Phase 0 stub.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
