import PrayerTowerKit
import SwiftUI

/// Me → Admin → Kindness (admins only): the kindness starter set and the kindness weather, as in
/// the Expo app's Admin screen. The server checks the admin role again.
struct AdminKindnessView: View {
    @Environment(AppModel.self) private var model
    @State private var starter: KindnessStarter?
    @State private var weather: KindnessWeather?
    @State private var note: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            if let s = starter {
                Section {
                    Text(w("starter.intro")).font(.footnote)
                    Text(w("starter.count", ["on": String(s.onCount), "total": String(s.items.count)]))
                    ForEach(s.items, id: \.key) { i in
                        Label(w("starter.items.\(i.key)"), systemImage: i.on ? "checkmark.circle.fill" : "circle")
                            .accessibilityLabel("\(w("starter.items.\(i.key)")), \(i.on ? "on" : "off")")
                    }
                    if !s.allOn { Button(w("starter.turnOn")) { Task { await setStarter(true) } } }
                    if s.anyOn { Button(w("starter.turnOff"), role: .destructive) { Task { await setStarter(false) } } }
                } header: { Text(w("starter.title")) }
            }
            if let weather, weather.enabled {
                Section {
                    Text(w("weather.intro")).font(.footnote)
                    ForEach(weather.weeks) { wk in
                        let l = wk.lines(w)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(wk.sky) \(l.title)")
                            if let n = l.numbers { Text(n).font(.footnote).foregroundStyle(Color.subtle) }
                        }
                        .accessibilityElement(children: .combine)
                    }
                } header: { Text(w("weather.title")) }
            }
            if let note { Section { Text(note).font(.footnote) } }
        }
        .navigationTitle(w("starter.title"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do { starter = try await model.store.api.kindnessStarter() } catch { note = error.localizedDescription }
        weather = try? await model.store.api.kindnessWeather()
    }

    private func setStarter(_ on: Bool) async {
        do {
            starter = try await model.store.api.setKindnessStarter(on)
            note = w("starter.done")
            // The switches changed: read them again so every screen follows.
            await model.loadSettings()
        } catch { note = error.localizedDescription }
    }
}
