//! Treatment-protocol DSL: parse, evaluate, grade, and log deviations.
//!
//! Per steering doc §3.3, protocols are authored as YAML data files (see
//! `data/protocols/`) and interpreted at runtime. The engine provides
//! guidance and grading; it never forces the player's hand.
//!
//! Phase 0 stub. Parser and evaluator land in Phase 1 alongside the
//! chest-pain-adult vertical slice.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
