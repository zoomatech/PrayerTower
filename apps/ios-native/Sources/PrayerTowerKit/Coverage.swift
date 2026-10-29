import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// The listener map (Admin → Radio → Coverage map, docs/STATION_OPERATOR_GUIDE.md "Coverage map"):
// listener nodes that opted in, each colored by the signal it hears from the station, with what
// it listens with (a radio or an RTL-SDR dongle) and its latest reports. Off until an admin turns
// the coverage map on. `CoverageDemo` is sample data for when no server or account is set up.

/// `GET /admin/radio-coverage`.
public struct CoverageMap: Codable, Sendable, Equatable {
    public struct Spot: Codable, Sendable, Equatable {
        public let lat: Double
        public let lon: Double
        public init(lat: Double, lon: Double) {
            self.lat = lat
            self.lon = lon
        }
    }

    /// What a node listens with (station sdr.ts), when it has said.
    public struct Receiver: Codable, Sendable, Equatable {
        /// sound-card | rtl-sdr
        public let kind: String
        public let freqHz: Int?
        /// fm | usb
        public let mode: String?
        public init(kind: String, freqHz: Int? = nil, mode: String? = nil) {
            self.kind = kind
            self.freqHz = freqHz
            self.mode = mode
        }

        public var isSdr: Bool { kind == "rtl-sdr" }
        /// "146.520 MHz FM"
        public var tuning: String? {
            guard let freqHz else { return nil }
            return String(format: "%.3f MHz", Double(freqHz) / 1e6) + (mode.map { " \($0.uppercased())" } ?? "")
        }
    }

    public struct Point: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let name: String
        public let place: String?
        public let lat: Double
        public let lon: Double
        /// Median SNR of the last 24 hours' reports; nil when it heard nothing.
        public let snrDb: Double?
        public let reports: Int
        public let lastHeardAt: String?
        public let lastSeenAt: String?
        /// strong | fair | weak | none
        public let quality: String
        public let receiver: Receiver?

        public init(id: String, name: String, place: String?, lat: Double, lon: Double, snrDb: Double?, reports: Int, lastHeardAt: String?, lastSeenAt: String?, quality: String,
                    receiver: Receiver?) {
            self.id = id
            self.name = name
            self.place = place
            self.lat = lat
            self.lon = lon
            self.snrDb = snrDb
            self.reports = reports
            self.lastHeardAt = lastHeardAt
            self.lastSeenAt = lastSeenAt
            self.quality = quality
            self.receiver = receiver
        }
    }

    public struct Unplaced: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let name: String
    }

    public var enabled: Bool
    public var tileUrl: String
    public var station: Spot?
    public var points: [Point]
    public var unplaced: [Unplaced]

    /// The middle and size (in degrees) of a view that shows the station and every node, with a margin.
    public var region: (center: Spot, latSpan: Double, lonSpan: Double)? {
        let spots = points.map { Spot(lat: $0.lat, lon: $0.lon) } + (station.map { [$0] } ?? [])
        guard let first = spots.first else { return nil }
        var (minLat, maxLat, minLon, maxLon) = (first.lat, first.lat, first.lon, first.lon)
        for s in spots {
            minLat = min(minLat, s.lat); maxLat = max(maxLat, s.lat)
            minLon = min(minLon, s.lon); maxLon = max(maxLon, s.lon)
        }
        // At least about 50 km across, so one node doesn't fill the screen.
        return (Spot(lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2), max(0.5, (maxLat - minLat) * 1.4), max(0.5, (maxLon - minLon) * 1.4))
    }

    /// The server's coloring (radio/coverage.ts quality): strong 20 dB and up, fair 10 to 20, weak under 10.
    public static func quality(_ snrDb: Double?) -> String {
        guard let snrDb else { return "none" }
        return snrDb >= 20 ? "strong" : snrDb >= 10 ? "fair" : "weak"
    }
}

private struct CoveragePatch: Encodable { let enabled: Bool }
private struct PlaceBody: Encodable {
    struct Location: Encodable { let lat: Double; let lon: Double; let place: String? }
    let location: Location?
    enum CodingKeys: CodingKey { case location }
    /// `{"location":null}` removes the node from the map, so null is written out.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        if let location { try c.encode(location, forKey: .location) } else { try c.encodeNil(forKey: .location) }
    }
}

extension APIClient {
    public func coverageMap() async throws -> CoverageMap { try await get("/admin/radio-coverage") }
    /// The coverage map's switch (off by default).
    public func setCoverageMap(enabled: Bool) async throws -> CoverageMap {
        try await send(body(request("PATCH", "/admin/radio-coverage"), CoveragePatch(enabled: enabled)))
    }
    /// Place a node by hand, or remove it from the map with nil.
    public func placeNode(_ id: String, lat: Double, lon: Double, place: String?) async throws -> CoverageMap {
        try await send(body(request("PUT", "/admin/radio-nodes/\(id)/location"), PlaceBody(location: .init(lat: lat, lon: lon, place: place))))
    }
    public func unplaceNode(_ id: String) async throws -> CoverageMap {
        try await send(body(request("PUT", "/admin/radio-nodes/\(id)/location"), PlaceBody(location: nil)))
    }
}

/// Sample data for the listener map with no server or account: a station and four listeners
/// around Springfield, Illinois, two of them RTL-SDR dongles. Changes stay on the sample.
public struct CoverageDemo: Sendable {
    public var map: CoverageMap
    public var reports: [RadioNodes.Report]

    public init(now: Date = .now) {
        func iso(_ minutes: Double) -> String { ISO8601DateFormatter().string(from: now.addingTimeInterval(minutes * 60)) }
        let sdr = CoverageMap.Receiver(kind: "rtl-sdr", freqHz: 146_520_000, mode: "fm")
        let radio = CoverageMap.Receiver(kind: "sound-card")
        map = CoverageMap(
            enabled: true, tileUrl: "", station: .init(lat: 39.8, lon: -89.6),
            points: [
                .init(id: "demo-n1", name: "Hilltop", place: "Springfield, IL", lat: 39.8, lon: -89.7, snrDb: 24.5, reports: 31, lastHeardAt: iso(-4), lastSeenAt: iso(-1), quality: "strong", receiver: radio),
                .init(id: "demo-n2", name: "Church roof", place: "Chatham, IL", lat: 39.7, lon: -89.7, snrDb: 16.0, reports: 28, lastHeardAt: iso(-9), lastSeenAt: iso(-2), quality: "fair", receiver: sdr),
                .init(id: "demo-n3", name: "Farm kitchen", place: "Petersburg, IL", lat: 40.0, lon: -89.8, snrDb: 7.5, reports: 12, lastHeardAt: iso(-40), lastSeenAt: iso(-3), quality: "weak", receiver: sdr),
                .init(id: "demo-n4", name: "Lake cabin", place: "Taylorville, IL", lat: 39.5, lon: -89.3, snrDb: nil, reports: 0, lastHeardAt: nil, lastSeenAt: iso(-1), quality: "none", receiver: radio),
            ],
            unplaced: [.init(id: "demo-n5", name: "Garage scanner")])
        reports = [
            .init(node: "Hilltop", call_sign: "N0CALL", preset: "fm-standard", snr_db: 24.5, heard_at: iso(-4)),
            .init(node: "Church roof", call_sign: "N0CALL", preset: "fm-standard", snr_db: 16.0, heard_at: iso(-9)),
            .init(node: "Farm kitchen", call_sign: "N0CALL", preset: "fm-robust-fec", snr_db: 7.5, heard_at: iso(-40)),
        ]
    }

    public mutating func setEnabled(_ on: Bool) { map.enabled = on }
}
