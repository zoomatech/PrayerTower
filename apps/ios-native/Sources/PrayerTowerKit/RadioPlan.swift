import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// The band plan and urgent prayers (Admin → Radio, the operator console, and the urgent button on
// a request; docs/STATION_OPERATOR_GUIDE.md "Band plan", "Urgent prayers"). Each is off until an
// admin turns it on. `RadioPlanDemo` is sample data for when no server or account is set up.

/// A band the station may use (server radio/band-plan.ts).
public struct RadioBand: Codable, Sendable, Equatable, Hashable {
    public let label: String
    public let freqHz: Int
    /// fm | usb
    public let mode: String
    public let preset: String?

    public init(label: String, freqHz: Int, mode: String, preset: String? = nil) {
        self.label = label; self.freqHz = freqHz; self.mode = mode; self.preset = preset
    }

    public var isHf: Bool { freqHz < 30_000_000 }
    /// "14.103" on HF, "146.52" above.
    public var mhz: String { String(format: isHf ? "%.3f" : "%.2f", Double(freqHz) / 1e6) }
    /// One line of the bands box: "20 m, 14.103, usb, hf-standard".
    public var line: String { [label, mhz, mode, preset].compactMap { $0 }.joined(separator: ", ") }

    /// Each line of the bands box to a band; nil when a line doesn't read.
    public static func parse(_ text: String) -> [RadioBand]? {
        var bands: [RadioBand] = []
        for line in text.split(separator: "\n").map({ $0.trimmingCharacters(in: .whitespaces) }) where !line.isEmpty {
            let parts = line.split(separator: ",", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
            guard parts.count >= 3, !parts[0].isEmpty, let mhz = Double(parts[1]), ["fm", "usb"].contains(parts[2]) else { return nil }
            let hz = Int((mhz * 1e6).rounded())
            guard hz >= 500_000 else { return nil }
            bands.append(RadioBand(label: parts[0], freqHz: hz, mode: parts[2], preset: parts.count > 3 && !parts[3].isEmpty ? parts[3] : nil))
        }
        return bands
    }
}

/// NOAA SWPC's 10.7 cm solar flux and planetary K index, as the server last read them.
public struct SpaceWeather: Codable, Sendable, Equatable {
    public let sfi: Double
    public let kp: Double
    public let fluxAt: String
    public let fetchedAt: String
}

public struct BandPick: Codable, Sendable, Equatable {
    public let band: RadioBand
    /// hf | only | vhf | no-data
    public let reason: String
    public let mufMhz: Double?
    public let workingMhz: Double?
}

/// Now and the next 24 hours (`outlook` of GET /admin/band-plan, `band` of the console).
public struct BandOutlook: Codable, Sendable, Equatable {
    public struct Hour: Codable, Sendable, Equatable, Identifiable {
        public let at: String
        public let band: String?
        public let mufMhz: Double?
        public let onAir: Bool
        public var id: String { at }
    }
    public let now: BandPick?
    public let spaceWeather: SpaceWeather?
    public let hours: [Hour]

    /// The hours where the band changes, after the first, so the list stays short (as the Expo card).
    public var changes: [Hour] {
        let marks = hours.enumerated().filter { i, h in i == 0 || h.band != hours[i - 1].band }.map(\.element)
        return Array(marks.dropFirst().prefix(6))
    }
}

public struct BandPlan: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var bands: [RadioBand]
    public let spaceWeather: SpaceWeather?
    public var outlook: BandOutlook?
}

/// One urgent send of the last two days (server radio/urgent.ts).
public struct UrgentPrayer: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let postId: String
    public let text: String
    /// queued | sending | transmitted | failed
    public let status: String
    public let repeats: Int
    public let flaggedAt: String
    public let transmittedAt: String?
    public let confirmedAt: String?
    public let heardCount: Int
    public let retries: Int
}

public struct UrgentRadio: Codable, Sendable, Equatable {
    public static let repeatChoices = [2, 3, 5]
    public static let presetChoices = ["auto", "fm-robust-fec", "fm-robust", "hf-robust"]

    public var enabled: Bool
    public var repeats: Int
    /// A burst preset, or "auto": the robust one for the band.
    public var preset: String
    public let confirmMinutes: Int
    public let maxRetries: Int
    public let presetNow: String?
    public let nextWindowAt: String?
    public var prayers: [UrgentPrayer]

    /// Who may mark a request urgent, and which requests: admins and radio operators, on a
    /// prayer request that is not sensitive and not answered (the server checks the rest).
    public static func mayFlag(roles: [String], card: Card) -> Bool {
        (roles.contains("admin") || roles.contains("radio_operator"))
            && card.postType == "prayer_request" && card.isSensitive != true && card.state != "answered"
    }
}

public struct UrgentFlagged: Codable, Sendable, Equatable {
    public let id: String
    public let nextWindowAt: String?
}

private struct PlanPatch: Encodable { let enabled: Bool?; let bands: [RadioBand]? }
private struct UrgentPatch: Encodable { let enabled: Bool?; let repeats: Int?; let preset: String? }
private struct FlagBody: Encodable { let postId: String }

extension APIClient {
    /// Radio operators read it; only admins change it.
    public func bandPlan() async throws -> BandPlan { try await get("/admin/band-plan") }
    public func updateBandPlan(enabled: Bool? = nil, bands: [RadioBand]? = nil) async throws -> BandPlan {
        try await send(body(request("PATCH", "/admin/band-plan"), PlanPatch(enabled: enabled, bands: bands)))
    }
    public func urgentRadio() async throws -> UrgentRadio { try await get("/admin/urgent-radio") }
    public func updateUrgentRadio(enabled: Bool? = nil, repeats: Int? = nil, preset: String? = nil) async throws -> UrgentRadio {
        try await send(body(request("PATCH", "/admin/urgent-radio"), UrgentPatch(enabled: enabled, repeats: repeats, preset: preset)))
    }
    /// A 404 while urgent prayers are off; a 400 when the request can't go on the air.
    public func flagUrgent(postId: String) async throws -> UrgentFlagged {
        try await send(body(request("POST", "/admin/urgent-radio"), FlagBody(postId: postId)))
    }
    public func unflagUrgent(_ id: String) async throws -> UrgentRadio { try await send(request("DELETE", "/admin/urgent-radio/\(id)")) }
}

/// Sample data with no server or account: an HF and a 2 m band with the next day's picks, and
/// urgent prayers waiting, sent and confirmed. Changes stay on the sample.
public struct RadioPlanDemo: Sendable, Equatable {
    public var plan: BandPlan
    public var urgent: UrgentRadio

    public init(now: Date = .now) {
        let iso = { (minutes: Double) in Keying.isoString(now.addingTimeInterval(minutes * 60)) }
        let bands = [
            RadioBand(label: "40 m", freqHz: 7_103_000, mode: "usb"),
            RadioBand(label: "20 m", freqHz: 14_103_000, mode: "usb", preset: "hf-standard"),
            RadioBand(label: "15 m", freqHz: 21_103_000, mode: "usb"),
        ]
        let weather = SpaceWeather(sfi: 152.3, kp: 2.7, fluxAt: iso(-180), fetchedAt: iso(-40))
        let hour = Date(timeIntervalSince1970: (now.timeIntervalSince1970 / 3600).rounded(.down) * 3600)
        let hours = (0..<24).map { i -> BandOutlook.Hour in
            let at = hour.addingTimeInterval(Double(i) * 3600)
            let local = Calendar.current.component(.hour, from: at)
            let band = (9..<16).contains(local) ? "15 m" : (6..<20).contains(local) ? "20 m" : "40 m"
            return .init(at: Keying.isoString(at), band: band, mufMhz: band == "15 m" ? 27.4 : band == "20 m" ? 19.6 : 9.8, onAir: !(0..<6).contains(local))
        }
        let nowBand = bands.first { $0.label == hours[0].band }!
        plan = BandPlan(enabled: true, bands: bands, spaceWeather: weather,
                        outlook: BandOutlook(now: BandPick(band: nowBand, reason: "hf", mufMhz: hours[0].mufMhz, workingMhz: hours[0].mufMhz.map { ($0 * 8).rounded() / 10 }),
                                             spaceWeather: weather, hours: hours))
        urgent = UrgentRadio(enabled: true, repeats: 3, preset: "auto", confirmMinutes: 15, maxRetries: 2, presetNow: "hf-robust", nextWindowAt: iso(4), prayers: [
            .init(id: "demo-u1", postId: "demo-p1", text: "Sample: for the miners trapped since this morning", status: "queued", repeats: 3, flaggedAt: iso(-3),
                  transmittedAt: nil, confirmedAt: nil, heardCount: 0, retries: 0),
            .init(id: "demo-u2", postId: "demo-p2", text: "Sample: for a baby in intensive care tonight", status: "transmitted", repeats: 3, flaggedAt: iso(-50),
                  transmittedAt: iso(-44), confirmedAt: nil, heardCount: 0, retries: 1),
            .init(id: "demo-u3", postId: "demo-p3", text: "Sample: for the families after the flood", status: "transmitted", repeats: 3, flaggedAt: iso(-300),
                  transmittedAt: iso(-290), confirmedAt: iso(-288), heardCount: 2, retries: 0),
        ])
    }

    public mutating func setBands(_ bands: [RadioBand]) { plan.bands = bands }
    public mutating func unflag(_ id: String) { urgent.prayers.removeAll { $0.id == id && $0.status == "queued" } }
}
