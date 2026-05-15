//! Deterministic time and randomness primitives for the EMS simulator core.
//!
//! Per the steering doc §5.2 the simulation runs at a fixed step of 50 Hz
//! (20 ms per tick) and *all* randomness must come from a single seeded
//! generator with named sub-streams so each subsystem can draw independently
//! while preserving end-to-end reproducibility.
//!
//! This crate intentionally has **no external dependencies** in Phase 0 so
//! the scaffold compiles on any toolchain. The PRNG used here is
//! [`SplitMix64`], a well-known, fixed-point mixing function (see
//! Steele, Lea & Flood, "Fast Splittable Pseudorandom Number Generators",
//! OOPSLA 2014). It is good enough for scenario seeding and for serving as
//! the seeder for higher-quality per-subsystem generators we may add later
//! (e.g. `Xoshiro256**` or `ChaCha8`) once a final dependency choice is made
//! in ADR-0001.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

use core::hash::{Hash, Hasher};

/// Length of one simulation tick.
///
/// 20 milliseconds → 50 Hz, matching steering-doc §5.2.
pub const TICK_DURATION_NS: u64 = 20_000_000;

/// Number of ticks per simulated second.
pub const TICKS_PER_SECOND: u64 = 1_000_000_000 / TICK_DURATION_NS;

/// Monotonic, integer-valued simulation time.
///
/// Counted in whole ticks since the start of a run. We deliberately avoid
/// floating-point time to keep the model bit-exact across platforms.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Tick(pub u64);

impl Tick {
    /// The zero tick (start of a run).
    pub const ZERO: Self = Self(0);

    /// Return the next tick.
    #[must_use]
    pub const fn succ(self) -> Self {
        Self(self.0 + 1)
    }

    /// Convert this tick into elapsed nanoseconds since run start.
    #[must_use]
    pub const fn as_nanos(self) -> u128 {
        self.0 as u128 * TICK_DURATION_NS as u128
    }

    /// Convert this tick into elapsed milliseconds since run start.
    #[must_use]
    pub const fn as_millis(self) -> u64 {
        self.0 * (TICK_DURATION_NS / 1_000_000)
    }

    /// Convert this tick into elapsed seconds (truncating).
    #[must_use]
    pub const fn as_secs(self) -> u64 {
        self.0 / TICKS_PER_SECOND
    }
}

/// A deterministic, fixed-step simulation clock.
///
/// The clock is the sole source of truth for the current tick. Subsystems
/// must read it; they must not call any wall-clock APIs.
#[derive(Clone, Copy, Debug, Default)]
pub struct SimClock {
    current: Tick,
}

impl SimClock {
    /// Create a new clock at tick zero.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            current: Tick::ZERO,
        }
    }

    /// Current tick.
    #[must_use]
    pub const fn now(self) -> Tick {
        self.current
    }

    /// Advance the clock by exactly one tick.
    pub fn advance(&mut self) -> Tick {
        self.current = self.current.succ();
        self.current
    }
}

/// A seed for a simulation run. Wrapping a `u64` makes it intent-explicit at
/// call sites and prevents accidental mixing with arbitrary integers.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct Seed(pub u64);

/// `SplitMix64` pseudorandom generator.
///
/// Pure 64-bit integer arithmetic with no external state — bit-exact across
/// any conforming Rust target.
#[derive(Clone, Copy, Debug)]
pub struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    /// Create a generator from a seed.
    #[must_use]
    pub const fn new(seed: Seed) -> Self {
        Self { state: seed.0 }
    }

    /// Draw the next `u64`.
    pub fn next_u64(&mut self) -> u64 {
        // Constants from Steele/Lea/Flood, OOPSLA 2014.
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Draw a uniform `f64` in `[0.0, 1.0)`.
    #[allow(
        clippy::cast_precision_loss,
        reason = "Both casts are exact: `next_u64() >> 11` fits in 53 bits, \
                  and `1u64 << 53` is exactly representable as f64."
    )]
    pub fn next_unit_f64(&mut self) -> f64 {
        // 53-bit mantissa: take top 53 bits of the next u64.
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }
}

/// Stable, deterministic hash of a stream name to a 64-bit value.
///
/// We do not use `std::collections::hash_map::DefaultHasher` because its
/// implementation is not guaranteed stable across Rust releases. Instead we
/// use FNV-1a, which is trivially specified and bit-exact forever.
fn fnv1a_64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// A registry of named pseudorandom sub-streams derived from a single seed.
///
/// The contract is: given the same `Seed`, calling [`Rng::stream`] with the
/// same `name` always returns a generator with the same starting state, and
/// calling it with two different names returns generators that are
/// *independent* with overwhelming probability. This satisfies §5.2.
#[derive(Clone, Copy, Debug)]
pub struct Rng {
    root: Seed,
}

impl Rng {
    /// Create a new RNG registry from a run seed.
    #[must_use]
    pub const fn from_seed(seed: Seed) -> Self {
        Self { root: seed }
    }

    /// Derive a deterministic sub-stream by name.
    ///
    /// Example sub-stream names: `"physiology.cardio"`,
    /// `"protocols.chest-pain-adult"`, `"world.weather"`.
    pub fn stream(self, name: &str) -> SplitMix64 {
        let name_hash = fnv1a_64(name.as_bytes());
        // Mix the root seed and the name hash through one SplitMix step
        // before handing the result to the user-visible generator. This
        // ensures small changes in either input produce uncorrelated streams.
        let mut seeder = SplitMix64::new(Seed(self.root.0 ^ name_hash));
        let derived = seeder.next_u64();
        SplitMix64::new(Seed(derived))
    }

    /// Convenience: derive a sub-stream from any hashable key.
    pub fn stream_from<H: Hash + ?Sized>(self, key: &H) -> SplitMix64 {
        // Use FNV-1a over the hashed bytes via a tiny adapter so we keep
        // determinism without depending on `DefaultHasher`.
        struct FnvHasher(u64);
        impl Hasher for FnvHasher {
            fn finish(&self) -> u64 {
                self.0
            }
            fn write(&mut self, bytes: &[u8]) {
                for &b in bytes {
                    self.0 ^= u64::from(b);
                    self.0 = self.0.wrapping_mul(0x0000_0100_0000_01b3);
                }
            }
        }
        let mut hasher = FnvHasher(0xcbf2_9ce4_8422_2325);
        key.hash(&mut hasher);
        let mut seeder = SplitMix64::new(Seed(self.root.0 ^ hasher.finish()));
        let derived = seeder.next_u64();
        SplitMix64::new(Seed(derived))
    }
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "Test code: panics on unexpected failure are the desired signal."
)]
mod tests {
    use super::*;

    #[test]
    fn tick_arithmetic() {
        assert_eq!(Tick::ZERO.succ(), Tick(1));
        assert_eq!(Tick(50).as_millis(), 1_000);
        assert_eq!(Tick(50).as_secs(), 1);
        assert_eq!(TICKS_PER_SECOND, 50);
    }

    #[test]
    fn clock_advances_monotonically() {
        let mut clock = SimClock::new();
        assert_eq!(clock.now(), Tick::ZERO);
        for expected in 1u64..=100 {
            assert_eq!(clock.advance(), Tick(expected));
        }
    }

    #[test]
    fn splitmix_is_deterministic() {
        let mut a = SplitMix64::new(Seed(42));
        let mut b = SplitMix64::new(Seed(42));
        for _ in 0..1000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn splitmix_known_first_output() {
        // Reference value: SplitMix64 of seed=0 returns
        // 0xE220A8397B1DCDAF on the first draw (Steele/Lea/Flood test vector).
        let mut rng = SplitMix64::new(Seed(0));
        assert_eq!(rng.next_u64(), 0xE220_A839_7B1D_CDAF);
    }

    #[test]
    fn unit_f64_is_in_range() {
        let mut rng = SplitMix64::new(Seed(123));
        for _ in 0..10_000 {
            let x = rng.next_unit_f64();
            assert!((0.0..1.0).contains(&x), "f64 out of range: {x}");
        }
    }

    #[test]
    fn rng_streams_with_same_name_are_identical() {
        let rng = Rng::from_seed(Seed(7));
        let mut s1 = rng.stream("physiology.cardio");
        let mut s2 = rng.stream("physiology.cardio");
        for _ in 0..100 {
            assert_eq!(s1.next_u64(), s2.next_u64());
        }
    }

    #[test]
    fn rng_streams_with_different_names_diverge() {
        let rng = Rng::from_seed(Seed(7));
        let mut a = rng.stream("physiology.cardio");
        let mut b = rng.stream("physiology.respiratory");
        // Extremely unlikely (effectively impossible) for the first 4 draws
        // to coincide between independent streams.
        let a_draws: Vec<u64> = (0..4).map(|_| a.next_u64()).collect();
        let b_draws: Vec<u64> = (0..4).map(|_| b.next_u64()).collect();
        assert_ne!(a_draws, b_draws);
    }

    #[test]
    fn rng_stream_changes_with_seed() {
        let mut a = Rng::from_seed(Seed(1)).stream("x");
        let mut b = Rng::from_seed(Seed(2)).stream("x");
        assert_ne!(a.next_u64(), b.next_u64());
    }
}
