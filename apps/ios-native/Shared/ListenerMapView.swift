import MapKit
import PrayerTowerKit
import SwiftUI

// The listener map for admins (Admin → Radio, and the Mac console): listener nodes on a map,
// each colored by the signal it hears from the station, with what it listens with (a radio or
// an RTL-SDR dongle), its latest reports, and the station as a star. Off until the coverage map
// switch is on. With no server or account (`api` nil) it shows CoverageDemo, and the switch
// changes only the sample. Locations are rounded to about a city, so each node is drawn as an
// area about 11 km across rather than a pin on a house.

struct ListenerMapView: View {
    let api: APIClient?
    let words: Words
    @State private var demo = CoverageDemo()
    @State private var map: CoverageMap?
    @State private var reports: [RadioNodes.Report] = []
    @State private var error: String?
    @State private var camera: MapCameraPosition = .automatic

    private static let qualities = ["strong", "fair", "weak", "none"]

    var body: some View {
        let w = words
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if api == nil { Label(w("macConsole.demo"), systemImage: "info.circle").font(.footnote) }
                if let error { Text(error).foregroundStyle(.red) }
                if map == nil && error == nil { ProgressView() }
                if let m = map {
                    Toggle(isOn: Binding(get: { m.enabled }, set: { v in Task { await setEnabled(v) } })) {
                        VStack(alignment: .leading) {
                            Text(w(m.enabled ? "coverage.on" : "coverage.off"))
                            Text(w("coverage.hint")).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    if m.enabled { content(m) }
                }
            }
            .padding()
        }
        .navigationTitle(w("coverage.title"))
        .task { await load() }
    }

    @ViewBuilder
    private func content(_ m: CoverageMap) -> some View {
        let w = words
        if m.points.isEmpty && m.station == nil {
            Text(w("coverage.empty"))
        } else {
            Map(position: $camera) {
                if let s = m.station {
                    Annotation(w("coverage.stationPin"), coordinate: Self.coordinate(s.lat, s.lon)) {
                        Image(systemName: "star.fill").foregroundStyle(.yellow).shadow(radius: 1)
                    }
                }
                ForEach(m.points) { p in
                    MapCircle(center: Self.coordinate(p.lat, p.lon), radius: 5_500)
                        .foregroundStyle(Self.color(p.quality).opacity(0.25))
                        .stroke(Self.color(p.quality), lineWidth: 2)
                    Annotation(p.name, coordinate: Self.coordinate(p.lat, p.lon)) {
                        Image(systemName: p.receiver?.isSdr == true ? "dot.radiowaves.left.and.right" : "radio")
                            .padding(4)
                            .background(Circle().fill(Self.color(p.quality)))
                            .foregroundStyle(.white)
                    }
                }
            }
            .frame(minHeight: 320)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityLabel(w("coverage.mapLabel", count: m.points.count))
            HStack(spacing: 12) {
                ForEach(Self.qualities, id: \.self) { q in
                    Label { Text(w("coverage.quality.\(q)")).font(.caption) } icon: { Circle().fill(Self.color(q)).frame(width: 10, height: 10) }
                }
            }
            ForEach(m.points) { p in
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.place.map { "\(p.name), \($0)" } ?? p.name).font(.headline)
                    if let r = p.receiver {
                        Text(r.isSdr ? w("coverage.sdr", ["tuning": r.tuning ?? ""]) : w("coverage.radio")).font(.footnote)
                    }
                    Text(p.snrDb.map { w("coverage.heard", ["db": String(format: "%.1f", $0)], count: p.reports) } ?? w("coverage.heardNothing"))
                        .font(.footnote)
                        .foregroundStyle(Self.color(p.quality))
                }
                .accessibilityElement(children: .combine)
            }
        }
        if !reports.isEmpty {
            Text(w("coverage.recent")).font(.headline)
            ForEach(reports, id: \.node) { r in
                Text(w("admin.listenerHeard", ["name": r.node, "callSign": r.call_sign, "snr": r.snr_db.formatted(), "preset": r.preset, "when": r.heard_at]))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        if !m.unplaced.isEmpty {
            Text(w("coverage.unplaced", ["names": m.unplaced.map(\.name).joined(separator: ", ")])).font(.footnote).foregroundStyle(.secondary)
        }
    }

    private static func coordinate(_ lat: Double, _ lon: Double) -> CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }

    static func color(_ quality: String) -> Color {
        switch quality {
        case "strong": .green
        case "fair": .orange
        case "weak": .red
        default: .gray
        }
    }

    private func show(_ m: CoverageMap) {
        map = m
        if let r = m.region {
            camera = .region(MKCoordinateRegion(center: Self.coordinate(r.center.lat, r.center.lon), span: MKCoordinateSpan(latitudeDelta: r.latSpan, longitudeDelta: r.lonSpan)))
        }
    }

    private func load() async {
        guard let api else {
            show(demo.map)
            reports = demo.reports
            return
        }
        do {
            show(try await api.coverageMap())
            // The latest reports come with the node list (only while listener nodes are on).
            reports = (try? await api.radioNodes().reports) ?? []
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setEnabled(_ on: Bool) async {
        guard let api else {
            demo.setEnabled(on)
            show(demo.map)
            return
        }
        do {
            show(try await api.setCoverageMap(enabled: on))
        } catch {
            self.error = error.localizedDescription
        }
    }
}
