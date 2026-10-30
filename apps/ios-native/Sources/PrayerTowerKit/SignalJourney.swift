import Foundation

// Signal journey (docs/STATION_OPERATOR_GUIDE.md, "Signal journey"), as packages/shared signalJourney:
// how far a radio prayer's wave front is from Earth since it went out, the places it has
// passed and the next one. Off until Admin → Radio turns it on.

public enum SignalJourney {
    /// The speed of light in km/s (exact, by the SI definition of the metre).
    public static let lightKmS = 299_792.458
    static let auKm = 149_597_870.7
    public static let lightYearKm = 9_460_730_472_580.8

    /// Nearest first, with average or fixed distances from Earth in km.
    public static let landmarks: [(key: String, km: Double)] = [
        ("moon", 384_400),
        ("sun", auKm),
        ("neptune", 30.07 * auKm),
        ("heliopause", 121 * auKm),
        ("voyager", lightKmS * 86_400),
        ("lightYear", lightYearKm),
        ("proxima", 4.2465 * lightYearKm),
    ]

    public struct Next: Equatable, Sendable {
        public let key: String
        public let inSeconds: Double
        public let fraction: Double
    }

    public struct Point: Equatable, Sendable {
        public let seconds: Double
        public let km: Double
        /// Rounded to one decimal, in the largest light unit that fits.
        public let lightValue: Double
        /// second | minute | hour | day | year
        public let lightUnit: String
        public let passed: [String]
        public let next: Next?
    }

    static let units: [(String, Double)] = [("year", 365.25 * 86_400), ("day", 86_400), ("hour", 3_600), ("minute", 60), ("second", 1)]

    /// The largest unit that fits `seconds`, and how many of it.
    public static func unit(_ seconds: Double) -> (unit: String, count: Double) {
        let (u, size) = units.first { seconds >= $0.1 } ?? units[units.count - 1]
        return (u, seconds / size)
    }

    public static func at(sentAt: Date, now: Date) -> Point {
        let seconds = max(0, now.timeIntervalSince(sentAt))
        let km = seconds * lightKmS
        let (u, count) = unit(seconds)
        let passed = landmarks.filter { $0.km <= km }.map(\.key)
        let prev = passed.isEmpty ? 0 : landmarks[passed.count - 1].km
        let next = landmarks.first { $0.km > km }.map { Next(key: $0.key, inSeconds: ($0.km - km) / lightKmS, fraction: (km - prev) / ($0.km - prev)) }
        return Point(seconds: seconds, km: km, lightValue: (count * 10).rounded() / 10, lightUnit: u, passed: passed, next: next)
    }

    /// Where a distance sits on a log-scale track, 0 (Earth, from 1,000 km) to 1 (the last landmark).
    public static func track(_ km: Double) -> Double {
        let maxLog = log10(landmarks[landmarks.count - 1].km)
        return min(1, max(0, (log10(max(km, 1_000)) - 3) / (maxLog - 3)))
    }
}
