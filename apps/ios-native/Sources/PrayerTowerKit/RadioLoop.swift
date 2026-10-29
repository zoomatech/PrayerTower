import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Closing the loop for members, reading aloud and name privacy (docs/STATION_OPERATOR_GUIDE.md
// "Sent by radio", "Read aloud", "Privacy on the air"). Each is off until an admin turns it on.
// `RadioLoopDemo` is sample data for when no server or account is set up.

/// "Sent by radio at 9:30 PM, heard by 4 listeners" on a request (`GET /posts/:id/radio-summary`).
public struct RadioSummary: Codable, Sendable, Equatable {
    public struct Place: Codable, Sendable, Equatable, Identifiable {
        public let name: String
        public let lat: Double
        public let lon: Double
        public let snrDb: Double
        public var id: String { name }
    }
    public struct Latest: Codable, Sendable, Equatable {
        public let sentAt: String
        public let callSign: String?
        public let heardBy: Int
        public let places: [Place]
    }
    public struct Spot: Codable, Sendable, Equatable {
        public let lat: Double
        public let lon: Double
    }
    public var optedIn: Bool
    public let latest: Latest?
    public let sends: Int
    public let station: Spot?
}

/// The member's own radio choices; nil while the admin's switch for it is off.
public struct RadioPrefs: Codable, Sendable, Equatable {
    public var followup: Bool?
    public var namesPrivate: Bool?
}

public struct RadioLoopSettings: Codable, Sendable, Equatable {
    public var followup: Bool
    public var readAloud: Bool
    public var namePrivacy: Bool
}

/// Where the station and the nodes that heard a prayer sit on a small flat map, north up.
public enum HeardMapLayout {
    public struct Dot: Sendable, Equatable {
        public let name: String
        public let station: Bool
        public let x: Double
        public let y: Double
    }

    public static func dots(_ s: RadioSummary, width: Double, height: Double, pad: Double = 18) -> [Dot] {
        let places = s.latest?.places ?? []
        guard !places.isEmpty else { return [] }
        let spots = (s.station.map { [("", true, $0.lat, $0.lon)] } ?? []) + places.map { ($0.name, false, $0.lat, $0.lon) }
        let lats = spots.map(\.2), lons = spots.map(\.3)
        // At least about 20 km across, so one or two close spots don't fill the box.
        let span = max(0.2, lats.max()! - lats.min()!, lons.max()! - lons.min()!)
        let midLat = (lats.max()! + lats.min()!) / 2, midLon = (lons.max()! + lons.min()!) / 2
        let scale = min(width - 2 * pad, height - 2 * pad) / span
        return spots.map { Dot(name: $0.0, station: $0.1, x: width / 2 + ($0.3 - midLon) * scale, y: height / 2 - ($0.2 - midLat) * scale) }
    }
}

private struct PrefsPatch: Encodable { let followup: Bool?; let namesPrivate: Bool? }
private struct LoopPatch: Encodable { let followup: Bool?; let readAloud: Bool?; let namePrivacy: Bool? }

extension APIClient {
    /// A 404 while the switch is off.
    public func radioSummary(postId: String) async throws -> RadioSummary { try await get("/posts/\(postId)/radio-summary") }
    public func radioPrefs() async throws -> RadioPrefs { try await get("/me/radio-prefs") }
    public func updateRadioPrefs(followup: Bool? = nil, namesPrivate: Bool? = nil) async throws -> RadioPrefs {
        try await send(body(request("PATCH", "/me/radio-prefs"), PrefsPatch(followup: followup, namesPrivate: namesPrivate)))
    }
    public func radioLoop() async throws -> RadioLoopSettings { try await get("/admin/radio-loop") }
    public func updateRadioLoop(followup: Bool? = nil, readAloud: Bool? = nil, namePrivacy: Bool? = nil) async throws -> RadioLoopSettings {
        try await send(body(request("PATCH", "/admin/radio-loop"), LoopPatch(followup: followup, readAloud: readAloud, namePrivacy: namePrivacy)))
    }
}

/// Sample data with no server or account: a prayer sent 40 minutes ago, heard by four listeners,
/// two of them on the map. Changes stay on the sample.
public struct RadioLoopDemo: Sendable, Equatable {
    public var summary: RadioSummary
    public var prefs: RadioPrefs
    public var settings: RadioLoopSettings

    public init(now: Date = .now) {
        summary = RadioSummary(
            optedIn: false,
            latest: .init(sentAt: Keying.isoString(now.addingTimeInterval(-40 * 60)), callSign: "N0CALL", heardBy: 4, places: [
                .init(name: "Hilltop", lat: 39.8, lon: -89.5, snrDb: 15.1),
                .init(name: "Church roof", lat: 39.7, lon: -89.7, snrDb: 8.4),
            ]),
            sends: 2,
            station: .init(lat: 39.8, lon: -89.7))
        prefs = RadioPrefs(followup: false, namesPrivate: false)
        settings = RadioLoopSettings(followup: true, readAloud: true, namePrivacy: true)
    }

    public mutating func setFollowup(_ on: Bool) {
        prefs.followup = on
        summary.optedIn = on
    }
}
