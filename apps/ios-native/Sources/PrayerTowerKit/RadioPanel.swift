import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// The prayer panel's server side (docs/RADIO_BURST.md, "Prayer panel"; the Expo app's
// prayer-panel screen): the latest prayers that went out, to draw as a panel, and the admin's
// switch. Off until Admin → Radio turns it on (a 404 while off). The format is in Burst/Panel.swift.

/// `GET /radio/panel`: the latest prayers sent, newest first.
public struct PanelLatest: Codable, Sendable, Equatable {
    public let callSign: String
    public let prayers: [String]
    public let at: String?

    public init(callSign: String, prayers: [String], at: String? = nil) {
        self.callSign = callSign
        self.prayers = prayers
        self.at = at
    }

    /// Sample data with no server or account.
    public static let sample = PanelLatest(callSign: PanelDemo.callSign, prayers: PanelDemo.prayers)
}

/// `GET/PATCH /admin/radio-panel`.
public struct PanelSwitch: Codable, Sendable, Equatable {
    public var enabled: Bool
    public init(enabled: Bool) { self.enabled = enabled }
}

extension APIClient {
    /// A 404 while the switch is off.
    public func radioPanel() async throws -> PanelLatest { try await get("/radio/panel") }
    public func radioPanelSwitch() async throws -> PanelSwitch { try await get("/admin/radio-panel") }
    public func setRadioPanel(_ enabled: Bool) async throws -> PanelSwitch {
        try await send(body(request("PATCH", "/admin/radio-panel"), PanelSwitch(enabled: enabled)))
    }
}

extension HeardFrame {
    /// A panel read from an SSTV picture, shown on the Listen screen like any other frame.
    public static func sstv(_ panel: PanelRead, end: Int) -> HeardFrame {
        HeardFrame(callSign: panel.callSign, preset: PrayerPanel.sstvPreset, snrDb: 0, corrected: panel.corrected, prayers: panel.prayers,
                   codec: 3, via: nil, hops: nil, start: max(0, end - 37 * SstvListener.rate), end: end)
    }
}
