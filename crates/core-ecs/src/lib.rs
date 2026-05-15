//! Entity-Component-System primitives.
//!
//! Per steering doc §5.3, components are pure data and systems are pure
//! functions over component sets. The concrete ECS choice (in-house,
//! `bevy_ecs`, `hecs`) is deferred to ADR-0001's stack lock.
//!
//! Phase 0 stub: type-only sketch; no implementation yet.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

/// Opaque entity handle.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Entity(pub u64);
